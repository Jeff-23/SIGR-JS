import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoCaja,
  Prisma,
  TipoMetodoPago,
  TipoMovimientoCaja,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { ListarCajasDto } from './dto/listar-cajas.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';

@Injectable()
export class CajasService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuario: UsuarioAutenticado,
  ) {
    return (
      usuario.rol === 'SUPERADMIN' &&
      usuario.restauranteId === null
    );
  }

  private permiteMulticaja(
    usuario: UsuarioAutenticado,
  ) {
    return (
      this.esSuperadmin(usuario) ||
      usuario.capacidades.includes('MULTICAJA')
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
              id: usuario.restauranteId!,
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

  private async bloquearCaja(
    tx: Prisma.TransactionClient,
    cajaId: number,
  ) {
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
    const [
      efectivo,
      otros,
      ingresos,
      egresos,
    ] = await Promise.all([
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

    const totalEfectivoSistema =
      efectivo._sum.monto ??
      new Prisma.Decimal(0);

    const totalOtrosPagos =
      otros._sum.monto ??
      new Prisma.Decimal(0);

    const totalIngresos =
      ingresos._sum.monto ??
      new Prisma.Decimal(0);

    const totalEgresos =
      egresos._sum.monto ??
      new Prisma.Decimal(0);

    const saldoEsperado =
      saldoInicial
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
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const sucursal =
          await tx.sucursal.findFirst({
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
          throw new NotFoundException(
            'Sucursal no encontrada',
          );
        }

        await this.bloquearSucursal(
          tx,
          sucursal.id,
        );

        if (!this.permiteMulticaja(usuario)) {
          const cajaAbierta =
            await tx.caja.findFirst({
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
          throw new BadRequestException(
            'El nombre de la caja es obligatorio',
          );
        }

        const observacion =
          data.observacion?.trim() || null;

        return tx.caja.create({
          data: {
            nombre,
            saldoInicial: new Prisma.Decimal(
              data.saldoInicial,
            ),
            observacionApertura: observacion,
            sucursalId: sucursal.id,
            abiertaPorId: usuario.id,
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
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  listarAbiertas(
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.caja.findMany({
      where: {
        estado: EstadoCaja.ABIERTA,
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

  async historial(
    filtros: ListarCajasDto,
    usuario: UsuarioAutenticado,
  ) {
    let desde: Date | undefined;
    let hasta: Date | undefined;

    if (filtros.desde) {
      desde = new Date(filtros.desde);
    }

    if (filtros.hasta) {
      hasta = new Date(filtros.hasta);
    }

    if (
      desde &&
      hasta &&
      desde.getTime() > hasta.getTime()
    ) {
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
    });
  }

  async detalle(
    id: number,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const caja =
          await tx.caja.findFirst({
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
          throw new NotFoundException(
            'Caja no encontrada',
          );
        }

        const resumen =
          await this.calcularResumen(
            tx,
            caja.id,
            caja.saldoInicial,
          );

        return {
          ...caja,
          resumen,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async registrarMovimiento(
    cajaId: number,
    data: RegistrarMovimientoCajaDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.bloquearCaja(
          tx,
          cajaId,
        );

        const caja =
          await tx.caja.findFirst({
            where: {
              id: cajaId,
              estado: EstadoCaja.ABIERTA,
              sucursal: this.filtroSucursal(usuario),
            },
          });

        if (!caja) {
          throw new NotFoundException(
            'Caja abierta no encontrada',
          );
        }

        const concepto =
          data.concepto.trim();

        if (!concepto) {
          throw new BadRequestException(
            'El concepto del movimiento es obligatorio',
          );
        }

        return tx.movimientoCaja.create({
          data: {
            tipo: data.tipo,
            monto: new Prisma.Decimal(data.monto),
            concepto,
            observacion:
              data.observacion?.trim() || null,
            cajaId: caja.id,
            usuarioId: usuario.id,
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
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async cerrar(
    cajaId: number,
    data: CerrarCajaDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.bloquearCaja(
          tx,
          cajaId,
        );

        const caja =
          await tx.caja.findFirst({
            where: {
              id: cajaId,
              estado: EstadoCaja.ABIERTA,
              sucursal: this.filtroSucursal(usuario),
            },
          });

        if (!caja) {
          throw new NotFoundException(
            'Caja abierta no encontrada',
          );
        }

        const resumen =
          await this.calcularResumen(
            tx,
            caja.id,
            caja.saldoInicial,
          );

        const saldoContado =
          new Prisma.Decimal(
            data.saldoContado,
          );

        const diferencia =
          saldoContado.minus(
            resumen.saldoEsperado,
          );

        return tx.caja.update({
          where: {
            id: caja.id,
          },
          data: {
            estado: EstadoCaja.CERRADA,
            fechaCierre: new Date(),
            cerradaPorId: usuario.id,
            saldoEsperado:
              resumen.saldoEsperado,
            saldoContado,
            diferencia,
            totalEfectivoSistema:
              resumen.totalEfectivoSistema,
            totalOtrosPagos:
              resumen.totalOtrosPagos,
            totalIngresos:
              resumen.totalIngresos,
            totalEgresos:
              resumen.totalEgresos,
            observacionCierre:
              data.observacion?.trim() || null,
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
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}
