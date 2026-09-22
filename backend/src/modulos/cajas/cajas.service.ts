import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  EstadoCaja,
  Prisma,
  TipoMetodoPago,
  TipoMovimientoCaja,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncBusinessService } from '../sync/sync-business.service';

import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { ListarCajasDto } from './dto/listar-cajas.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';
import {
  CierreTurnoSnapshot,
  generarXlsx,
  generarPdfSimple,
} from './cierre-turno-reportes';
import {
  hashSolicitud,
  normalizarClaveIdempotencia,
  validarReplayIdempotente,
} from '../../plataforma/idempotencia';

@Injectable()
export class CajasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncBusiness: SyncBusinessService,
  ) {}

  private esSuperadmin(usuario: UsuarioAutenticado) {
    return usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
  }

  private permiteMulticaja(usuario: UsuarioAutenticado) {
    return (
      this.esSuperadmin(usuario) || usuario.capacidades.includes('MULTICAJA')
    );
  }

  private filtroSucursal(
    usuario: UsuarioAutenticado,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      restaurante: {
        estado: true,

        ...(!this.esSuperadmin(usuario)
          ? {
              id: usuario.restauranteId,
            }
          : {}),
      },

      ...(usuario.sucursalId !== null
        ? {
            id: usuario.sucursalId,
          }
        : {}),
    };
  }

  private async bloquearSucursal(
    tx: Prisma.TransactionClient,
    sucursalId: number,
  ) {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "Sucursal"
        WHERE "id" = ${sucursalId}
        FOR UPDATE
      `,
    );
  }

  private async bloquearCaja(tx: Prisma.TransactionClient, cajaId: number) {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "Caja"
        WHERE "id" = ${cajaId}
        FOR UPDATE
      `,
    );
  }

  private async calcularResumen(
    tx: Prisma.TransactionClient,
    cajaId: number,
    saldoInicial: Prisma.Decimal,
  ) {
    const [efectivo, otros, ingresos, egresos] = await Promise.all([
      tx.pago.aggregate({
        where: {
          cajaId,
          metodoPago: {
            tipo: TipoMetodoPago.EFECTIVO,
          },
        },
        _sum: {
          monto: true,
        },
      }),

      tx.pago.aggregate({
        where: {
          cajaId,
          metodoPago: {
            tipo: {
              not: TipoMetodoPago.EFECTIVO,
            },
          },
        },
        _sum: {
          monto: true,
        },
      }),

      tx.movimientoCaja.aggregate({
        where: {
          cajaId,
          tipo: TipoMovimientoCaja.INGRESO,
        },
        _sum: {
          monto: true,
        },
      }),

      tx.movimientoCaja.aggregate({
        where: {
          cajaId,
          tipo: TipoMovimientoCaja.EGRESO,
        },
        _sum: {
          monto: true,
        },
      }),
    ]);

    const totalEfectivoSistema = efectivo._sum.monto ?? new Prisma.Decimal(0);

    const totalOtrosPagos = otros._sum.monto ?? new Prisma.Decimal(0);

    const totalIngresos = ingresos._sum.monto ?? new Prisma.Decimal(0);

    const totalEgresos = egresos._sum.monto ?? new Prisma.Decimal(0);

    const saldoEsperado = saldoInicial
      .plus(totalEfectivoSistema)
      .plus(totalIngresos)
      .minus(totalEgresos);

    return {
      totalEfectivoSistema,
      totalOtrosPagos,
      totalIngresos,
      totalEgresos,
      saldoEsperado,
    };
  }

  async abrir(
    data: AbrirCajaDto,
    usuario: UsuarioAutenticado,
    claveRecibida?: string,
  ) {
    const clave =
      claveRecibida === undefined
        ? undefined
        : normalizarClaveIdempotencia(claveRecibida);
    const hash = hashSolicitud({ data, usuarioId: usuario.id });
    return this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findFirst({
        where: {
          AND: [
            {
              id: data.sucursalId,
            },
            this.filtroSucursal(usuario),
          ],
        },
      });

      if (!sucursal) {
        throw new NotFoundException('Sucursal no encontrada');
      }

      await this.bloquearSucursal(tx, sucursal.id);

      if (clave) {
        const replay = await tx.caja.findUnique({
          where: {
            sucursalId_aperturaClave: {
              sucursalId: sucursal.id,
              aperturaClave: clave,
            },
          },
          include: {
            sucursal: true,
            abiertaPor: {
              select: { id: true, nombres: true, apellidos: true, email: true },
            },
          },
        });
        if (replay) {
          validarReplayIdempotente(replay.aperturaHash, hash);
          return replay;
        }
      }

      if (!this.permiteMulticaja(usuario)) {
        const cajaAbierta = await tx.caja.findFirst({
          where: {
            sucursalId: sucursal.id,
            estado: EstadoCaja.ABIERTA,
          },
          select: {
            id: true,
            nombre: true,
          },
        });

        if (cajaAbierta) {
          throw new BadRequestException(
            'El plan del restaurante permite una sola caja abierta por sucursal',
          );
        }
      }

      const nombre = data.nombre.trim();

      if (!nombre) {
        throw new BadRequestException('El nombre de la caja es obligatorio');
      }

      const observacion = data.observacion?.trim() || null;

      const cajaCreada = await tx.caja.create({
        data: {
          nombre,
          saldoInicial: new Prisma.Decimal(data.saldoInicial),
          observacionApertura: observacion,
          sucursalId: sucursal.id,
          abiertaPorId: usuario.id,
          aperturaClave: clave,
          aperturaHash: clave ? hash : undefined,
        },
        include: {
          sucursal: true,
          abiertaPor: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              email: true,
            },
          },
        },
      });
      await this.syncBusiness.encolarCaja(tx, cajaCreada.id);
      return cajaCreada;
    });
  }

  listarAbiertas(usuario: UsuarioAutenticado, sucursalId?: number) {
    return this.prisma.caja.findMany({
      where: {
        estado: EstadoCaja.ABIERTA,
        ...(sucursalId ? { sucursalId } : {}),
        sucursal: this.filtroSucursal(usuario),
      },
      include: {
        sucursal: true,
        abiertaPor: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaApertura: 'desc',
      },
    });
  }

  async historial(filtros: ListarCajasDto, usuario: UsuarioAutenticado) {
    let desde: Date | undefined;
    let hasta: Date | undefined;

    if (filtros.desde) {
      desde = new Date(filtros.desde);
    }

    if (filtros.hasta) {
      hasta = new Date(filtros.hasta);
    }

    if (desde && hasta && desde.getTime() > hasta.getTime()) {
      throw new BadRequestException(
        'La fecha desde no puede ser posterior a la fecha hasta',
      );
    }

    const where: Prisma.CajaWhereInput = {
      estado: EstadoCaja.CERRADA,
      sucursal: this.filtroSucursal(usuario),

      ...(filtros.sucursalId
        ? {
            sucursalId: filtros.sucursalId,
          }
        : {}),

      ...(desde || hasta
        ? {
            fechaApertura: {
              ...(desde ? { gte: desde } : {}),
              ...(hasta ? { lte: hasta } : {}),
            },
          }
        : {}),
    };

    return this.prisma.caja.findMany({
      where,
      include: {
        sucursal: true,
        abiertaPor: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
          },
        },
        cerradaPor: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
          },
        },
      },
      orderBy: {
        fechaCierre: 'desc',
      },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
    });
  }

  async detalle(id: number, usuario: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const caja = await tx.caja.findFirst({
        where: {
          id,
          sucursal: this.filtroSucursal(usuario),
        },
        include: {
          sucursal: true,
          abiertaPor: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              email: true,
            },
          },
          cerradaPor: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              email: true,
            },
          },
          movimientos: {
            include: {
              usuario: {
                select: {
                  id: true,
                  nombres: true,
                  apellidos: true,
                },
              },
            },
            orderBy: {
              creadoEn: 'asc',
            },
          },
          pagos: {
            include: {
              metodoPago: true,
              usuario: {
                select: {
                  id: true,
                  nombres: true,
                  apellidos: true,
                },
              },
              venta: {
                select: {
                  id: true,
                  total: true,
                  origen: true,
                  fechaOperacion: true,
                },
              },
            },
            orderBy: {
              creadoEn: 'asc',
            },
          },
        },
      });

      if (!caja) {
        throw new NotFoundException('Caja no encontrada');
      }

      const resumen = await this.calcularResumen(
        tx,
        caja.id,
        caja.saldoInicial,
      );

      return {
        ...caja,
        resumen,
      };
    });
  }

  async registrarMovimiento(
    cajaId: number,
    data: RegistrarMovimientoCajaDto,
    usuario: UsuarioAutenticado,
    claveRecibida?: string,
  ) {
    const clave =
      claveRecibida === undefined
        ? undefined
        : normalizarClaveIdempotencia(claveRecibida);
    const hash = hashSolicitud({ cajaId, data, usuarioId: usuario.id });
    return this.prisma.transaccionSerializable(async (tx) => {
      await this.bloquearCaja(tx, cajaId);

      const caja = await tx.caja.findFirst({
        where: {
          id: cajaId,
          sucursal: this.filtroSucursal(usuario),
        },
      });

      if (!caja) {
        throw new NotFoundException('Caja abierta no encontrada');
      }

      if (clave) {
        const replay = await tx.movimientoCaja.findUnique({
          where: {
            cajaId_idempotenciaClave: { cajaId, idempotenciaClave: clave },
          },
          include: {
            usuario: { select: { id: true, nombres: true, apellidos: true } },
          },
        });
        if (replay) {
          validarReplayIdempotente(replay.idempotenciaHash, hash);
          return replay;
        }
      }
      if (caja.estado !== EstadoCaja.ABIERTA)
        throw new BadRequestException('La caja está cerrada');
      if (caja.preCierreGeneradoEn) {
        throw new BadRequestException(
          'El turno está congelado para cierre y no admite nuevos movimientos',
        );
      }

      const concepto = data.concepto.trim();

      if (!concepto) {
        throw new BadRequestException(
          'El concepto del movimiento es obligatorio',
        );
      }

      const movimiento = await tx.movimientoCaja.create({
        data: {
          tipo: data.tipo,
          monto: new Prisma.Decimal(data.monto),
          concepto,
          observacion: data.observacion?.trim() || null,
          cajaId: caja.id,
          usuarioId: usuario.id,
          idempotenciaClave: clave,
          idempotenciaHash: clave ? hash : undefined,
        },
        include: {
          usuario: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
            },
          },
        },
      });
      await this.syncBusiness.encolarMovimientoCaja(tx, movimiento.id);
      await this.syncBusiness.encolarCaja(tx, caja.id);
      return movimiento;
    });
  }

  private async politicaDocumentosInternosFlexible(
    tx: Prisma.TransactionClient,
    restauranteId: number,
  ) {
    const config = await tx.configuracionRestaurante.findUnique({
      where: {
        restauranteId_clave: {
          restauranteId,
          clave: 'POLITICA_DOCUMENTOS_INTERNOS',
        },
      },
      select: { valor: true },
    });
    return config?.valor === 'FLEXIBLE';
  }

  private async obtenerCajaTurno(
    tx: Prisma.TransactionClient,
    cajaId: number,
    usuario: UsuarioAutenticado,
  ) {
    const caja = await tx.caja.findFirst({
      where: { id: cajaId, sucursal: this.filtroSucursal(usuario) },
      include: {
        sucursal: {
          include: { restaurante: { select: { id: true } } },
        },
      },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');
    return caja;
  }

  private async construirSnapshotTurno(
    tx: Prisma.TransactionClient,
    cajaId: number,
    usuario: UsuarioAutenticado,
  ): Promise<CierreTurnoSnapshot> {
    const caja = await this.obtenerCajaTurno(tx, cajaId, usuario);
    if (caja.estado !== EstadoCaja.ABIERTA) {
      throw new BadRequestException(
        'Solo una caja abierta puede preparar el cierre de turno',
      );
    }

    const pagos = await tx.pago.findMany({
      where: { cajaId: caja.id, ventaId: { not: null } },
      select: { ventaId: true },
    });
    const ventaIds = [
      ...new Set(
        pagos
          .map((pago) => pago.ventaId)
          .filter((id): id is number => id !== null),
      ),
    ];

    const ventas = ventaIds.length
      ? await tx.venta.findMany({
          where: { id: { in: ventaIds }, sucursalId: caja.sucursalId },
          include: {
            cliente: true,
            pedido: { include: { mesa: true } },
            detalles: { include: { producto: true }, orderBy: { id: 'asc' } },
            factura: { include: { documentoElectronico: true } },
            pagos: {
              where: { cajaId: caja.id },
              include: { metodoPago: true, devoluciones: true },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: [{ fechaOperacion: 'asc' }, { id: 'asc' }],
        })
      : [];

    let totalVentas = 0;
    let totalPagos = 0;
    let totalDevoluciones = 0;
    let efectivo = 0;
    let otrosPagos = 0;

    const snapshotVentas: CierreTurnoSnapshot['ventas'] = ventas.map(
      (venta) => {
        const pagosVenta = venta.pagos.map((pago) => {
          const devoluciones = pago.devoluciones.reduce(
            (sum, item) => sum + Number(item.monto),
            0,
          );
          const monto = Number(pago.monto);
          const neto = monto - devoluciones;
          totalPagos += monto;
          totalDevoluciones += devoluciones;
          if (pago.metodoPago.tipo === TipoMetodoPago.EFECTIVO)
            efectivo += neto;
          else otrosPagos += neto;
          return {
            metodo: pago.metodoPago.nombre,
            tipo: pago.metodoPago.tipo,
            monto,
            devoluciones,
            neto,
            referencia: pago.referencia,
          };
        });
        totalVentas += Number(venta.total);
        const documento = venta.factura?.documentoElectronico ?? null;
        return {
          ventaId: venta.id,
          fechaOperacion: venta.fechaOperacion.toISOString(),
          estado: venta.estado,
          origen: venta.origen,
          total: Number(venta.total),
          subtotal: Number(venta.subtotal),
          descuentos: Number(venta.descuentos),
          impuestos: Number(venta.impuestos),
          impoconsumo: Number(venta.impoconsumo),
          propina: Number(venta.propina),
          domicilio: Number(venta.domicilioCosto),
          pedidoId: venta.pedidoId,
          mesa: venta.pedido?.mesa?.numero ?? null,
          cliente: venta.cliente
            ? `${venta.cliente.nombres}${venta.cliente.apellidos ? ` ${venta.cliente.apellidos}` : ''}`
            : null,
          identificacionCliente: venta.cliente?.numeroDocumento ?? null,
          facturaInterna: venta.factura?.numero ?? null,
          estadoFactura: venta.factura?.estado ?? null,
          documentoElectronicoEstado: documento?.estado ?? null,
          documentoElectronicoNumero: documento?.numeroCompleto ?? null,
          fiscalizada: documento?.estado === 'ACEPTADO',
          detalles: venta.detalles.map((detalle) => ({
            producto: detalle.producto.nombre,
            cantidad: detalle.cantidad,
            precioUnitario: Number(detalle.precioUnitario),
            subtotal: Number(detalle.subtotal),
          })),
          pagos: pagosVenta,
        };
      },
    );

    return {
      version: 1,
      caja: {
        id: caja.id,
        nombre: caja.nombre,
        sucursalId: caja.sucursalId,
        sucursal: caja.sucursal.nombre,
        fechaApertura: caja.fechaApertura.toISOString(),
        generadoEn: new Date().toISOString(),
      },
      resumen: {
        operaciones: snapshotVentas.length,
        totalVentas,
        totalPagos,
        totalDevoluciones,
        totalNetoCobrado: totalPagos - totalDevoluciones,
        efectivo,
        otrosPagos,
      },
      ventas: snapshotVentas,
    };
  }

  async prepararCierreTurno(cajaId: number, usuario: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      await this.bloquearCaja(tx, cajaId);
      const caja = await this.obtenerCajaTurno(tx, cajaId, usuario);
      if (caja.preCierreSnapshot) {
        return {
          cajaId,
          generadoEn: caja.preCierreGeneradoEn,
          excelDescargadoEn: caja.preCierreExcelDescargadoEn,
          hash: caja.preCierreHash,
          snapshot: caja.preCierreSnapshot,
        };
      }
      const snapshot = await this.construirSnapshotTurno(tx, cajaId, usuario);
      const serialized = JSON.stringify(snapshot);
      const hash = createHash('sha256').update(serialized).digest('hex');
      const updated = await tx.caja.update({
        where: { id: cajaId },
        data: {
          preCierreGeneradoEn: new Date(snapshot.caja.generadoEn),
          preCierreSnapshot: snapshot,
          preCierreHash: hash,
          preCierreGeneradoPorId: usuario.id,
        },
        select: {
          id: true,
          preCierreGeneradoEn: true,
          preCierreExcelDescargadoEn: true,
          preCierreHash: true,
          preCierreSnapshot: true,
        },
      });
      return {
        cajaId: updated.id,
        generadoEn: updated.preCierreGeneradoEn,
        excelDescargadoEn: updated.preCierreExcelDescargadoEn,
        hash: updated.preCierreHash,
        snapshot: updated.preCierreSnapshot,
      };
    });
  }

  async estadoCierreTurno(cajaId: number, usuario: UsuarioAutenticado) {
    const caja = await this.prisma.caja.findFirst({
      where: { id: cajaId, sucursal: this.filtroSucursal(usuario) },
      select: {
        id: true,
        estado: true,
        preCierreGeneradoEn: true,
        preCierreExcelDescargadoEn: true,
        preCierreHash: true,
        preCierreSnapshot: true,
        sucursal: { select: { restauranteId: true } },
      },
    });
    if (!caja) throw new NotFoundException('Caja no encontrada');
    const flexible = await this.prisma.configuracionRestaurante.findUnique({
      where: {
        restauranteId_clave: {
          restauranteId: caja.sucursal.restauranteId,
          clave: 'POLITICA_DOCUMENTOS_INTERNOS',
        },
      },
      select: { valor: true },
    });
    const snapshot = caja.preCierreSnapshot as CierreTurnoSnapshot | null;
    return {
      cajaId: caja.id,
      cajaEstado: caja.estado,
      modoFlexible: flexible?.valor === 'FLEXIBLE',
      generadoEn: caja.preCierreGeneradoEn,
      excelDescargadoEn: caja.preCierreExcelDescargadoEn,
      hash: caja.preCierreHash,
      operaciones: snapshot?.resumen.operaciones ?? 0,
      listoParaCerrar:
        flexible?.valor !== 'FLEXIBLE' ||
        caja.preCierreExcelDescargadoEn !== null,
    };
  }

  async descargarExcelCierreTurno(cajaId: number, usuario: UsuarioAutenticado) {
    await this.prepararCierreTurno(cajaId, usuario);
    return this.prisma.transaccionSerializable(async (tx) => {
      await this.bloquearCaja(tx, cajaId);
      const caja = await this.obtenerCajaTurno(tx, cajaId, usuario);
      const snapshot = caja.preCierreSnapshot as CierreTurnoSnapshot | null;
      if (!snapshot)
        throw new BadRequestException('No existe fotografía previa del turno');
      const contenido = generarXlsx(snapshot);
      if (!caja.preCierreExcelDescargadoEn) {
        await tx.caja.update({
          where: { id: cajaId },
          data: { preCierreExcelDescargadoEn: new Date() },
        });
      }
      return {
        contenido,
        nombre: `cierre-turno-${caja.id}-previo.xlsx`,
      };
    });
  }

  async descargarPdfCierreTurno(cajaId: number, usuario: UsuarioAutenticado) {
    await this.prepararCierreTurno(cajaId, usuario);
    const caja = await this.prisma.caja.findFirst({
      where: { id: cajaId, sucursal: this.filtroSucursal(usuario) },
      select: { preCierreSnapshot: true },
    });
    const snapshot = caja?.preCierreSnapshot as CierreTurnoSnapshot | null;
    if (!snapshot)
      throw new BadRequestException('No existe fotografía previa del turno');
    return {
      contenido: generarPdfSimple(snapshot),
      nombre: `cierre-turno-${cajaId}-previo.pdf`,
    };
  }

  async cerrar(
    cajaId: number,
    data: CerrarCajaDto,
    usuario: UsuarioAutenticado,
    claveRecibida?: string,
  ) {
    const clave =
      claveRecibida === undefined
        ? undefined
        : normalizarClaveIdempotencia(claveRecibida);
    const hash = hashSolicitud({ cajaId, data, usuarioId: usuario.id });
    return this.prisma.transaccionSerializable(async (tx) => {
      await this.bloquearCaja(tx, cajaId);

      const caja = await tx.caja.findFirst({
        where: {
          id: cajaId,
          sucursal: this.filtroSucursal(usuario),
        },
      });

      if (!caja) {
        throw new NotFoundException('Caja abierta no encontrada');
      }

      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { id: caja.sucursalId },
        select: { restauranteId: true },
      });
      const modoFlexible = await this.politicaDocumentosInternosFlexible(
        tx,
        sucursal.restauranteId,
      );
      if (modoFlexible && !caja.preCierreExcelDescargadoEn) {
        throw new BadRequestException(
          'Descarga el Excel previo del turno antes de cerrar la caja',
        );
      }

      if (clave && caja.cierreClave === clave) {
        validarReplayIdempotente(caja.cierreHash, hash);
        return tx.caja.findUniqueOrThrow({
          where: { id: cajaId },
          include: {
            sucursal: true,
            abiertaPor: {
              select: { id: true, nombres: true, apellidos: true },
            },
            cerradaPor: {
              select: { id: true, nombres: true, apellidos: true },
            },
          },
        });
      }
      if (caja.estado !== EstadoCaja.ABIERTA)
        throw new BadRequestException('La caja está cerrada');

      const resumen = await this.calcularResumen(
        tx,
        caja.id,
        caja.saldoInicial,
      );

      const saldoContado = new Prisma.Decimal(data.saldoContado);

      const diferencia = saldoContado.minus(resumen.saldoEsperado);

      const cajaCerrada = await tx.caja.update({
        where: {
          id: caja.id,
        },
        data: {
          estado: EstadoCaja.CERRADA,
          cierreClave: clave,
          cierreHash: clave ? hash : undefined,
          fechaCierre: new Date(),
          cerradaPorId: usuario.id,
          saldoEsperado: resumen.saldoEsperado,
          saldoContado,
          diferencia,
          totalEfectivoSistema: resumen.totalEfectivoSistema,
          totalOtrosPagos: resumen.totalOtrosPagos,
          totalIngresos: resumen.totalIngresos,
          totalEgresos: resumen.totalEgresos,
          observacionCierre: data.observacion?.trim() || null,
        },
        include: {
          sucursal: true,
          abiertaPor: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
            },
          },
          cerradaPor: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
            },
          },
        },
      });
      await this.syncBusiness.encolarCaja(tx, cajaCerrada.id);
      return cajaCerrada;
    });
  }
}
