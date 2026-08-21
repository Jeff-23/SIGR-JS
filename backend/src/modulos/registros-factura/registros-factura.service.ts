import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { respuestaPaginada } from '../../plataforma/paginacion';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarRegistroFacturaDto } from './dto/actualizar-registro-factura.dto';
import { CrearRegistroFacturaDto } from './dto/crear-registro-factura.dto';
import { ListarRegistrosFacturaDto } from './dto/listar-registros-factura.dto';

@Injectable()
export class RegistrosFacturaService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuario: UsuarioAutenticado) {
    return usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
  }

  private alcance(
    usuario: UsuarioAutenticado,
  ): Prisma.RegistroFacturaOperativaWhereInput {
    if (this.esSuperadmin(usuario)) return {};
    if (usuario.restauranteId === null) {
      throw new ForbiddenException('El usuario no tiene restaurante asignado');
    }
    return {
      restauranteId: usuario.restauranteId,
      ...(usuario.sucursalId !== null
        ? { sucursalId: usuario.sucursalId }
        : {}),
    };
  }

  private fechaHasta(valor: string) {
    const fecha = new Date(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) fecha.setUTCHours(23, 59, 59, 999);
    return fecha;
  }

  private where(
    filtros: ListarRegistrosFacturaDto,
    usuario: UsuarioAutenticado,
  ) {
    if (
      usuario.sucursalId !== null &&
      filtros.sucursalId !== undefined &&
      filtros.sucursalId !== usuario.sucursalId
    ) {
      throw new ForbiddenException('La sucursal solicitada no está autorizada');
    }
    const buscar = filtros.buscar?.trim();
    return {
      ...this.alcance(usuario),
      ...((usuario.sucursalId ?? filtros.sucursalId)
        ? { sucursalId: usuario.sucursalId ?? filtros.sucursalId }
        : {}),
      ...(filtros.digitadoPorId
        ? { digitadoPorId: filtros.digitadoPorId }
        : {}),
      ...(filtros.origen ? { origen: filtros.origen } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            fechaOperacion: {
              ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
              ...(filtros.hasta ? { lte: this.fechaHasta(filtros.hasta) } : {}),
            },
          }
        : {}),
      ...(filtros.montoDesde !== undefined || filtros.montoHasta !== undefined
        ? {
            total: {
              ...(filtros.montoDesde !== undefined
                ? { gte: filtros.montoDesde }
                : {}),
              ...(filtros.montoHasta !== undefined
                ? { lte: filtros.montoHasta }
                : {}),
            },
          }
        : {}),
      ...(buscar
        ? {
            OR: [
              {
                numero: {
                  contains: buscar,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                numeroComanda: {
                  contains: buscar,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                numeroSoporte: {
                  contains: buscar,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    } satisfies Prisma.RegistroFacturaOperativaWhereInput;
  }

  private async validarSucursal(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        estado: true,
        ...(!this.esSuperadmin(usuario)
          ? { restauranteId: usuario.restauranteId ?? -1 }
          : {}),
        ...(usuario.sucursalId !== null ? { id: usuario.sucursalId } : {}),
      },
      select: { id: true, restauranteId: true },
    });
    if (!sucursal)
      throw new NotFoundException('Sucursal no encontrada o no autorizada');
    return sucursal;
  }

  private texto(valor: string | undefined) {
    const limpio = valor?.trim();
    return limpio ? limpio : null;
  }

  private validarTotales(
    data: Pick<
      CrearRegistroFacturaDto,
      | 'subtotal'
      | 'descuentos'
      | 'impuestos'
      | 'propina'
      | 'domicilio'
      | 'total'
    >,
  ) {
    const esperado =
      data.subtotal -
      data.descuentos +
      data.impuestos +
      data.propina +
      data.domicilio;
    if (Math.abs(esperado - data.total) > 0.01) {
      throw new BadRequestException(
        'El total no coincide con subtotal, descuentos, impuestos, propina y domicilio',
      );
    }
  }

  async crear(
    data: CrearRegistroFacturaDto,
    idempotenciaClave: string | undefined,
    usuario: UsuarioAutenticado,
  ) {
    this.validarTotales(data);
    const totalDetalles = data.detalles.reduce(
      (total, detalle) => total + detalle.total,
      0,
    );
    if (Math.abs(totalDetalles - data.subtotal) > 0.01) {
      throw new BadRequestException(
        'El subtotal no coincide con los productos registrados',
      );
    }
    const sucursal = await this.validarSucursal(data.sucursalId, usuario);
    const clave = this.texto(idempotenciaClave)?.slice(0, 100) ?? null;
    if (clave) {
      const existente = await this.prisma.registroFacturaOperativa.findUnique({
        where: {
          sucursalId_idempotenciaClave: {
            sucursalId: data.sucursalId,
            idempotenciaClave: clave,
          },
        },
      });
      if (existente) return existente;
    }
    if (data.ventaId) {
      const venta = await this.prisma.venta.findFirst({
        where: { id: data.ventaId, sucursalId: data.sucursalId },
        select: { id: true },
      });
      if (!venta)
        throw new NotFoundException('Venta no encontrada en la sucursal');
    }
    try {
      return await this.prisma.registroFacturaOperativa.create({
        data: {
          numero: data.numero.trim(),
          numeroComanda: this.texto(data.numeroComanda),
          numeroSoporte: this.texto(data.numeroSoporte),
          origen: data.origen,
          fechaOperacion: new Date(data.fechaOperacion),
          subtotal: data.subtotal,
          descuentos: data.descuentos,
          impuestos: data.impuestos,
          propina: data.propina,
          domicilio: data.domicilio,
          total: data.total,
          detalles: data.detalles as unknown as Prisma.InputJsonValue,
          impuestosDetalle: data.impuestosDetalle as
            | Prisma.InputJsonValue
            | undefined,
          formasPago: data.formasPago as Prisma.InputJsonValue | undefined,
          soporteArchivoRef: this.texto(data.soporteArchivoRef),
          observaciones: this.texto(data.observaciones),
          idempotenciaClave: clave,
          restauranteId: sucursal.restauranteId,
          sucursalId: sucursal.id,
          digitadoPorId: usuario.id,
          ventaId: data.ventaId,
        },
        include: {
          sucursal: { select: { id: true, nombre: true } },
          digitadoPor: { select: { id: true, nombres: true, apellidos: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe la factura, comanda o soporte en esta sucursal',
        );
      }
      throw error;
    }
  }

  async listar(
    filtros: ListarRegistrosFacturaDto,
    usuario: UsuarioAutenticado,
  ) {
    const pagina = filtros.pagina ?? 1;
    const limite = filtros.limite ?? 20;
    const where = this.where(filtros, usuario);
    const [datos, total, resumen] = await this.prisma.$transaction([
      this.prisma.registroFacturaOperativa.findMany({
        where,
        include: {
          sucursal: { select: { id: true, nombre: true } },
          digitadoPor: { select: { id: true, nombres: true, apellidos: true } },
        },
        orderBy: [{ fechaOperacion: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      this.prisma.registroFacturaOperativa.count({ where }),
      this.prisma.registroFacturaOperativa.aggregate({
        where,
        _sum: {
          subtotal: true,
          descuentos: true,
          impuestos: true,
          propina: true,
          domicilio: true,
          total: true,
        },
      }),
    ]);
    return {
      ...respuestaPaginada(datos, total, pagina, limite),
      resumen: { cantidad: total, ...resumen._sum },
    };
  }

  async obtener(id: number, usuario: UsuarioAutenticado) {
    const registro = await this.prisma.registroFacturaOperativa.findFirst({
      where: { id, ...this.alcance(usuario) },
      include: {
        sucursal: { select: { id: true, nombre: true } },
        digitadoPor: { select: { id: true, nombres: true, apellidos: true } },
      },
    });
    if (!registro)
      throw new NotFoundException('Registro de factura no encontrado');
    return registro;
  }

  async actualizar(
    id: number,
    data: ActualizarRegistroFacturaDto,
    usuario: UsuarioAutenticado,
  ) {
    const actual = await this.obtener(id, usuario);
    const totales = {
      subtotal: data.subtotal ?? Number(actual.subtotal),
      descuentos: data.descuentos ?? Number(actual.descuentos),
      impuestos: data.impuestos ?? Number(actual.impuestos),
      propina: data.propina ?? Number(actual.propina),
      domicilio: data.domicilio ?? Number(actual.domicilio),
      total: data.total ?? Number(actual.total),
    };
    this.validarTotales(totales);
    const sucursalId = data.sucursalId ?? actual.sucursalId;
    const sucursal = await this.validarSucursal(sucursalId, usuario);
    const ventaId = data.ventaId ?? actual.ventaId;
    if (ventaId !== null) {
      const venta = await this.prisma.venta.findFirst({
        where: { id: ventaId, sucursalId: sucursal.id },
        select: { id: true },
      });
      if (!venta)
        throw new NotFoundException('Venta no encontrada en la sucursal');
    }
    try {
      return await this.prisma.registroFacturaOperativa.update({
        where: { id },
        data: {
          ...(data.numero !== undefined ? { numero: data.numero.trim() } : {}),
          ...(data.numeroComanda !== undefined
            ? { numeroComanda: this.texto(data.numeroComanda) }
            : {}),
          ...(data.numeroSoporte !== undefined
            ? { numeroSoporte: this.texto(data.numeroSoporte) }
            : {}),
          ...(data.origen !== undefined ? { origen: data.origen } : {}),
          ...(data.fechaOperacion !== undefined
            ? { fechaOperacion: new Date(data.fechaOperacion) }
            : {}),
          ...totales,
          ...(data.detalles !== undefined
            ? { detalles: data.detalles as unknown as Prisma.InputJsonValue }
            : {}),
          ...(data.impuestosDetalle !== undefined
            ? {
                impuestosDetalle:
                  data.impuestosDetalle as Prisma.InputJsonValue,
              }
            : {}),
          ...(data.formasPago !== undefined
            ? { formasPago: data.formasPago as Prisma.InputJsonValue }
            : {}),
          ...(data.soporteArchivoRef !== undefined
            ? { soporteArchivoRef: this.texto(data.soporteArchivoRef) }
            : {}),
          ...(data.observaciones !== undefined
            ? { observaciones: this.texto(data.observaciones) }
            : {}),
          sucursalId: sucursal.id,
          restauranteId: sucursal.restauranteId,
          ...(data.ventaId !== undefined ? { ventaId: data.ventaId } : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Ya existe la factura, comanda o soporte en esta sucursal',
        );
      throw error;
    }
  }

  async eliminar(id: number, usuario: UsuarioAutenticado) {
    const registro = await this.obtener(id, usuario);
    await this.prisma.registroFacturaOperativa.delete({
      where: { id: registro.id },
    });
    return { id: registro.id, eliminado: true };
  }

  async actualizarReferenciaSoporte(
    id: number,
    referencia: string,
    usuario: UsuarioAutenticado,
  ) {
    await this.obtener(id, usuario);
    return this.prisma.registroFacturaOperativa.update({
      where: { id },
      data: { soporteArchivoRef: referencia },
    });
  }

  async exportarCsv(
    filtros: ListarRegistrosFacturaDto,
    usuario: UsuarioAutenticado,
  ) {
    const datos = await this.prisma.registroFacturaOperativa.findMany({
      where: this.where(filtros, usuario),
      include: {
        sucursal: { select: { nombre: true } },
        digitadoPor: { select: { nombres: true, apellidos: true } },
      },
      orderBy: [{ fechaOperacion: 'asc' }, { id: 'asc' }],
    });
    const celda = (valor: string | number | Prisma.Decimal | null) => {
      const texto = String(valor ?? '');
      const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
      return `"${seguro.replaceAll('"', '""')}"`;
    };
    const filas = datos.map((item) =>
      [
        item.fechaOperacion.toISOString(),
        item.numero,
        item.numeroComanda,
        item.numeroSoporte,
        item.origen,
        item.sucursal.nombre,
        item.subtotal,
        item.descuentos,
        item.impuestos,
        item.propina,
        item.domicilio,
        item.total,
        `${item.digitadoPor.nombres} ${item.digitadoPor.apellidos}`,
      ]
        .map(celda)
        .join(','),
    );
    return `\uFEFF${['Fecha', 'Número', 'Comanda', 'Soporte', 'Origen', 'Sucursal', 'Subtotal', 'Descuentos', 'Impuestos', 'Propina', 'Domicilio', 'Total', 'Digitado por'].map(celda).join(',')}\n${filas.join('\n')}`;
  }
}
