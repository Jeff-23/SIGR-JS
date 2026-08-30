import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoVenta, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  hashSolicitud,
  normalizarClaveIdempotencia,
  validarReplayIdempotente,
} from '../../plataforma/idempotencia';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  CrearCierreAdministrativoDto,
  CrearFacturaProveedorDto,
  FiltroContabilidadDto,
  FiltroCuentaProveedorDto,
  RegistrarAbonoProveedorDto,
} from './dto/cuentas-pagar.dto';

@Injectable()
export class CuentasPagarService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroCuentaProveedorDto, usuario: UsuarioAutenticado) {
    await this.sucursal(filtro.sucursalId, usuario);
    await this.prisma.facturaProveedor.updateMany({
      where: {
        sucursalId: filtro.sucursalId,
        fechaVencimiento: { lt: this.hoy() },
        estado: { in: ['PENDIENTE', 'PARCIAL'] },
      },
      data: { estado: 'VENCIDA' },
    });
    return this.prisma.facturaProveedor.findMany({
      where: {
        sucursalId: filtro.sucursalId,
        ...(filtro.proveedorId ? { proveedorId: filtro.proveedorId } : {}),
      },
      include: {
        proveedor: true,
        ordenCompra: { select: { id: true } },
        abonos: {
          include: {
            registradoPor: { select: { nombres: true, apellidos: true } },
          },
          orderBy: { fecha: 'desc' },
        },
      },
      orderBy: [{ fechaVencimiento: 'asc' }, { id: 'desc' }],
    });
  }

  async crear(data: CrearFacturaProveedorDto, usuario: UsuarioAutenticado) {
    const branch = await this.sucursal(data.sucursalId, usuario);
    const supplier = await this.prisma.proveedor.findFirst({
      where: {
        id: data.proveedorId,
        restauranteId: branch.restauranteId,
        estado: true,
      },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    if (data.fechaVencimiento < data.fechaEmision)
      throw new BadRequestException(
        'El vencimiento no puede ser anterior a la emisión',
      );
    if (data.ordenCompraId) {
      const order = await this.prisma.ordenCompra.findFirst({
        where: {
          id: data.ordenCompraId,
          sucursalId: data.sucursalId,
          proveedorId: data.proveedorId,
        },
      });
      if (!order)
        throw new BadRequestException(
          'La orden no corresponde al proveedor y sede',
        );
    }
    return this.prisma.facturaProveedor.create({
      data: {
        ...data,
        numero: data.numero.trim(),
        saldo: data.total,
        registradoPorId: usuario.id,
      },
      include: { proveedor: true },
    });
  }

  async abonar(
    id: number,
    data: RegistrarAbonoProveedorDto,
    key: string | undefined,
    usuario: UsuarioAutenticado,
  ) {
    const idempotenciaClave = normalizarClaveIdempotencia(key);
    const idempotenciaHash = hashSolicitud(data);
    return this.prisma.transaccionSerializable(async (tx) => {
      const invoice = await tx.facturaProveedor.findUnique({
        where: { id },
        include: { sucursal: true },
      });
      if (!invoice)
        throw new NotFoundException('Factura de proveedor no encontrada');
      this.alcance(invoice.sucursal.restauranteId, invoice.sucursalId, usuario);
      const replay = await tx.abonoFacturaProveedor.findUnique({
        where: {
          facturaId_idempotenciaClave: { facturaId: id, idempotenciaClave },
        },
      });
      if (replay) {
        validarReplayIdempotente(replay.idempotenciaHash, idempotenciaHash);
        return replay;
      }
      if (!['PENDIENTE', 'PARCIAL', 'VENCIDA'].includes(invoice.estado))
        throw new BadRequestException('La factura no admite abonos');
      const monto = new Prisma.Decimal(data.monto);
      if (monto.gt(invoice.saldo))
        throw new BadRequestException('El abono supera el saldo pendiente');
      const saldo = invoice.saldo.minus(monto);
      const overdue = invoice.fechaVencimiento < this.hoy();
      const payment = await tx.abonoFacturaProveedor.create({
        data: {
          facturaId: id,
          registradoPorId: usuario.id,
          monto,
          metodo: data.metodo.trim().toUpperCase(),
          referencia: data.referencia,
          observaciones: data.observaciones,
          idempotenciaClave,
          idempotenciaHash,
        },
      });
      await tx.facturaProveedor.update({
        where: { id },
        data: {
          saldo,
          estado: saldo.eq(0) ? 'PAGADA' : overdue ? 'VENCIDA' : 'PARCIAL',
        },
      });
      return payment;
    });
  }

  async cerrar(
    data: CrearCierreAdministrativoDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursal(data.sucursalId, usuario);
    const { start, end } = this.day(data.fecha);
    return this.prisma.transaccionSerializable(async (tx) => {
      const existing = await tx.cierreAdministrativo.findUnique({
        where: {
          sucursalId_fecha: { sucursalId: data.sucursalId, fecha: start },
        },
      });
      if (existing) return existing;
      const [sales, collected, obligations, supplierPayments, payable, cash] =
        await Promise.all([
          tx.venta.aggregate({
            where: {
              sucursalId: data.sucursalId,
              estado: { not: EstadoVenta.ANULADA },
              fechaOperacion: { gte: start, lt: end },
            },
            _sum: { total: true },
          }),
          tx.pago.aggregate({
            where: {
              venta: { sucursalId: data.sucursalId },
              creadoEn: { gte: start, lt: end },
            },
            _sum: { monto: true },
          }),
          tx.facturaProveedor.aggregate({
            where: {
              sucursalId: data.sucursalId,
              creadoEn: { gte: start, lt: end },
            },
            _sum: { total: true },
          }),
          tx.abonoFacturaProveedor.aggregate({
            where: {
              factura: { sucursalId: data.sucursalId },
              fecha: { gte: start, lt: end },
            },
            _sum: { monto: true },
          }),
          tx.facturaProveedor.aggregate({
            where: {
              sucursalId: data.sucursalId,
              estado: { in: ['PENDIENTE', 'PARCIAL', 'VENCIDA'] },
            },
            _sum: { saldo: true },
          }),
          tx.caja.aggregate({
            where: {
              sucursalId: data.sucursalId,
              fechaCierre: { gte: start, lt: end },
            },
            _sum: { diferencia: true },
          }),
        ]);
      return tx.cierreAdministrativo.create({
        data: {
          sucursalId: data.sucursalId,
          cerradoPorId: usuario.id,
          fecha: start,
          totalVentas: sales._sum.total ?? 0,
          totalCobrado: collected._sum.monto ?? 0,
          nuevasObligaciones: obligations._sum.total ?? 0,
          abonosProveedores: supplierPayments._sum.monto ?? 0,
          saldoProveedores: payable._sum.saldo ?? 0,
          diferenciaCajas: cash._sum.diferencia ?? 0,
          observaciones: data.observaciones,
        },
      });
    });
  }

  async reporte(filtro: FiltroContabilidadDto, usuario: UsuarioAutenticado) {
    await this.sucursal(filtro.sucursalId, usuario);
    if (filtro.desde > filtro.hasta)
      throw new BadRequestException('Periodo inválido');
    const end = new Date(filtro.hasta);
    end.setDate(end.getDate() + 1);
    const [facturas, abonos, cierres] = await Promise.all([
      this.prisma.facturaProveedor.findMany({
        where: {
          sucursalId: filtro.sucursalId,
          ...(filtro.proveedorId ? { proveedorId: filtro.proveedorId } : {}),
          fechaEmision: { gte: filtro.desde, lt: end },
        },
        include: { proveedor: true },
        orderBy: { fechaEmision: 'asc' },
      }),
      this.prisma.abonoFacturaProveedor.findMany({
        where: {
          factura: {
            sucursalId: filtro.sucursalId,
            ...(filtro.proveedorId ? { proveedorId: filtro.proveedorId } : {}),
          },
          fecha: { gte: filtro.desde, lt: end },
        },
        include: { factura: { include: { proveedor: true } } },
        orderBy: { fecha: 'asc' },
      }),
      this.prisma.cierreAdministrativo.findMany({
        where: {
          sucursalId: filtro.sucursalId,
          fecha: { gte: filtro.desde, lt: end },
        },
        orderBy: { fecha: 'asc' },
      }),
    ]);
    return {
      periodo: { desde: filtro.desde, hasta: filtro.hasta },
      facturas,
      abonos,
      cierres,
      totales: {
        facturado: facturas.reduce(
          (sum, item) => sum.plus(item.total),
          new Prisma.Decimal(0),
        ),
        saldo: facturas.reduce(
          (sum, item) => sum.plus(item.saldo),
          new Prisma.Decimal(0),
        ),
        abonado: abonos.reduce(
          (sum, item) => sum.plus(item.monto),
          new Prisma.Decimal(0),
        ),
      },
    };
  }

  private hoy() {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
  private day(date: Date) {
    const start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  private async sucursal(id: number, usuario: UsuarioAutenticado) {
    const restaurant = this.restaurant(usuario);
    const branch = await this.prisma.sucursal.findFirst({
      where: {
        id,
        restauranteId: restaurant,
        ...(usuario.sucursalId ? { id: usuario.sucursalId } : {}),
      },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }
  private restaurant(usuario: UsuarioAutenticado) {
    if (usuario.restauranteId === null)
      throw new ForbiddenException('Se requiere contexto de restaurante');
    return usuario.restauranteId;
  }
  private alcance(
    restauranteId: number,
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    if (
      this.restaurant(usuario) !== restauranteId ||
      (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId)
    )
      throw new ForbiddenException('Recurso fuera del alcance');
  }
}
