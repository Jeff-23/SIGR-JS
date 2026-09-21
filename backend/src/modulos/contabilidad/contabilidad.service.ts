import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoVenta, Prisma, TipoMovimientoCaja } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type Rango = {
  inicio: Date;
  fin: Date;
  zonaHoraria: string;
};

@Injectable()
export class ContabilidadService {
  constructor(private readonly prisma: PrismaService) {}

  private async validarSucursal(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
      throw new BadRequestException('Sucursal inválida');
    }
    if (usuario.restauranteId === null) {
      throw new ForbiddenException('Se requiere contexto de restaurante');
    }
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        restauranteId: usuario.restauranteId,
        ...(usuario.sucursalId !== null ? { id: usuario.sucursalId } : {}),
      },
      select: { id: true, nombre: true },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }

  private async rango(
    sucursalId: number,
    desde: string,
    hasta: string,
  ): Promise<Rango> {
    const inicio = new Date(desde);
    const fin = new Date(hasta);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    if (inicio > fin) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final',
      );
    }
    if (fin.getTime() - inicio.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('El rango máximo permitido es de 366 días');
    }
    const configuracion = await this.prisma.configuracionSucursal.findUnique({
      where: {
        sucursalId_clave: { sucursalId, clave: 'ZONA_HORARIA' },
      },
      select: { valor: true },
    });
    return {
      inicio,
      fin,
      zonaHoraria:
        typeof configuracion?.valor === 'string'
          ? configuracion.valor
          : 'America/Bogota',
    };
  }

  private claveDia(fecha: Date, zonaHoraria: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(fecha);
    const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = parts.find((part) => part.type === 'month')?.value ?? '00';
    const day = parts.find((part) => part.type === 'day')?.value ?? '00';
    return `${year}-${month}-${day}`;
  }

  private numero(value: Prisma.Decimal | number | string | null | undefined) {
    return Number(value ?? 0);
  }

  async consulta(
    sucursalId: number,
    desde: string,
    hasta: string,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.validarSucursal(sucursalId, usuario);
    const { inicio, fin, zonaHoraria } = await this.rango(
      sucursalId,
      desde,
      hasta,
    );
    const ventaWhere: Prisma.VentaWhereInput = {
      sucursalId,
      fechaOperacion: { gte: inicio, lte: fin },
      estado: { not: EstadoVenta.ANULADA },
    };

    const [
      ventas,
      agregadoVentas,
      pagos,
      facturasProveedor,
      abonosProveedor,
      egresosCaja,
      cierres,
      ventasResumen,
      productosAgrupados,
      comprasResumen,
      abonosResumen,
      egresosResumen,
    ] = await Promise.all([
      this.prisma.venta.findMany({
        where: ventaWhere,
        orderBy: { fechaOperacion: 'desc' },
        take: 100,
        select: {
          id: true,
          fechaOperacion: true,
          estado: true,
          origen: true,
          subtotal: true,
          descuentos: true,
          impuestos: true,
          impoconsumo: true,
          propina: true,
          domicilioCosto: true,
          total: true,
          pedido: { select: { mesa: { select: { numero: true } } } },
          usuario: { select: { nombres: true, apellidos: true } },
          detalles: {
            select: {
              cantidad: true,
              precioUnitario: true,
              subtotal: true,
              producto: { select: { id: true, nombre: true } },
            },
          },
          pagos: {
            select: {
              monto: true,
              metodoPago: { select: { nombre: true } },
              devoluciones: { select: { monto: true } },
            },
          },
        },
      }),
      this.prisma.venta.aggregate({
        where: ventaWhere,
        _count: { _all: true },
        _sum: {
          total: true,
          subtotal: true,
          descuentos: true,
          impuestos: true,
          impoconsumo: true,
          propina: true,
        },
      }),
      this.prisma.pago.findMany({
        where: {
          venta: { sucursalId },
          creadoEn: { gte: inicio, lte: fin },
        },
        select: {
          monto: true,
          metodoPago: { select: { nombre: true } },
          devoluciones: { select: { monto: true } },
        },
      }),
      this.prisma.facturaProveedor.findMany({
        where: {
          sucursalId,
          fechaEmision: { gte: inicio, lte: fin },
        },
        orderBy: { fechaEmision: 'desc' },
        take: 100,
        select: {
          id: true,
          numero: true,
          fechaEmision: true,
          fechaVencimiento: true,
          total: true,
          saldo: true,
          estado: true,
          proveedor: { select: { nombre: true } },
        },
      }),
      this.prisma.abonoFacturaProveedor.findMany({
        where: {
          fecha: { gte: inicio, lte: fin },
          factura: { sucursalId },
        },
        orderBy: { fecha: 'desc' },
        take: 100,
        select: {
          id: true,
          fecha: true,
          monto: true,
          metodo: true,
          referencia: true,
          observaciones: true,
          factura: {
            select: {
              numero: true,
              proveedor: { select: { nombre: true } },
            },
          },
        },
      }),
      this.prisma.movimientoCaja.findMany({
        where: {
          tipo: TipoMovimientoCaja.EGRESO,
          creadoEn: { gte: inicio, lte: fin },
          caja: { sucursalId },
        },
        orderBy: { creadoEn: 'desc' },
        take: 100,
        select: {
          id: true,
          creadoEn: true,
          monto: true,
          concepto: true,
          observacion: true,
          caja: { select: { nombre: true } },
          usuario: { select: { nombres: true, apellidos: true } },
        },
      }),
      this.prisma.caja.findMany({
        where: {
          sucursalId,
          fechaCierre: { gte: inicio, lte: fin },
        },
        orderBy: { fechaCierre: 'desc' },
        take: 100,
        select: {
          id: true,
          nombre: true,
          fechaApertura: true,
          fechaCierre: true,
          saldoInicial: true,
          saldoEsperado: true,
          saldoContado: true,
          diferencia: true,
          totalIngresos: true,
          totalEgresos: true,
        },
      }),
      this.prisma.venta.findMany({
        where: ventaWhere,
        select: { id: true, fechaOperacion: true, total: true },
        orderBy: { fechaOperacion: 'asc' },
      }),
      this.prisma.detalleVenta.groupBy({
        by: ['productoId'],
        where: { venta: ventaWhere },
        _sum: { cantidad: true, subtotal: true },
      }),
      this.prisma.facturaProveedor.findMany({
        where: { sucursalId, fechaEmision: { gte: inicio, lte: fin } },
        select: { fechaEmision: true, total: true },
      }),
      this.prisma.abonoFacturaProveedor.findMany({
        where: { fecha: { gte: inicio, lte: fin }, factura: { sucursalId } },
        select: { fecha: true, monto: true },
      }),
      this.prisma.movimientoCaja.findMany({
        where: {
          tipo: TipoMovimientoCaja.EGRESO,
          creadoEn: { gte: inicio, lte: fin },
          caja: { sucursalId },
        },
        select: { creadoEn: true, monto: true },
      }),
    ]);

    const pagosPorMetodo = new Map<string, number>();
    let totalCobrado = 0;
    for (const pago of pagos) {
      const devuelto = pago.devoluciones.reduce(
        (sum, item) => sum + this.numero(item.monto),
        0,
      );
      const neto = Math.max(0, this.numero(pago.monto) - devuelto);
      totalCobrado += neto;
      const metodo = pago.metodoPago.nombre;
      pagosPorMetodo.set(metodo, (pagosPorMetodo.get(metodo) ?? 0) + neto);
    }

    const productos = await this.prisma.producto.findMany({
      where: { id: { in: productosAgrupados.map((item) => item.productoId) } },
      select: { id: true, nombre: true },
    });
    const nombresProducto = new Map(productos.map((item) => [item.id, item.nombre]));
    const productosResumen = productosAgrupados
      .map((item) => ({
        productoId: item.productoId,
        nombre: nombresProducto.get(item.productoId) ?? `Producto #${item.productoId}`,
        cantidad: item._sum.cantidad ?? 0,
        total: this.numero(item._sum.subtotal),
      }))
      .sort((a, b) => b.total - a.total);

    const totalCompras = comprasResumen.reduce(
      (sum, item) => sum + this.numero(item.total),
      0,
    );
    const totalPagadoProveedores = abonosResumen.reduce(
      (sum, item) => sum + this.numero(item.monto),
      0,
    );
    const totalEgresos = egresosResumen.reduce(
      (sum, item) => sum + this.numero(item.monto),
      0,
    );

    const dias = new Map<
      string,
      {
        fecha: string;
        ventas: number;
        cantidadVentas: number;
        compras: number;
        pagosProveedores: number;
        egresosCaja: number;
      }
    >();
    const dia = (fecha: Date) => {
      const clave = this.claveDia(fecha, zonaHoraria);
      const actual = dias.get(clave) ?? {
        fecha: clave,
        ventas: 0,
        cantidadVentas: 0,
        compras: 0,
        pagosProveedores: 0,
        egresosCaja: 0,
      };
      dias.set(clave, actual);
      return actual;
    };
    for (const venta of ventasResumen) {
      const actual = dia(venta.fechaOperacion);
      actual.ventas += this.numero(venta.total);
      actual.cantidadVentas += 1;
    }
    for (const factura of comprasResumen) {
      dia(factura.fechaEmision).compras += this.numero(factura.total);
    }
    for (const abono of abonosResumen) {
      dia(abono.fecha).pagosProveedores += this.numero(abono.monto);
    }
    for (const egreso of egresosResumen) {
      dia(egreso.creadoEn).egresosCaja += this.numero(egreso.monto);
    }

    return {
      sucursal,
      periodo: { desde: inicio, hasta: fin, zonaHoraria },
      resumen: {
        cantidadVentas: agregadoVentas._count._all,
        totalVentas: this.numero(agregadoVentas._sum.total),
        subtotalVentas: this.numero(agregadoVentas._sum.subtotal),
        descuentos: this.numero(agregadoVentas._sum.descuentos),
        impuestos: this.numero(agregadoVentas._sum.impuestos),
        impoconsumo: this.numero(agregadoVentas._sum.impoconsumo),
        propinas: this.numero(agregadoVentas._sum.propina),
        totalCobrado,
        totalCompras,
        totalPagadoProveedores,
        totalEgresos,
        cierresCaja: cierres.length,
      },
      pagosPorMetodo: [...pagosPorMetodo.entries()]
        .map(([metodo, total]) => ({ metodo, total }))
        .sort((a, b) => b.total - a.total),
      productos: productosResumen,
      diario: [...dias.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)),
      ventas: ventas.map((venta) => ({
        ...venta,
        subtotal: this.numero(venta.subtotal),
        descuentos: this.numero(venta.descuentos),
        impuestos: this.numero(venta.impuestos),
        impoconsumo: this.numero(venta.impoconsumo),
        propina: this.numero(venta.propina),
        domicilioCosto: this.numero(venta.domicilioCosto),
        total: this.numero(venta.total),
        detalles: venta.detalles.map((detalle) => ({
          ...detalle,
          precioUnitario: this.numero(detalle.precioUnitario),
          subtotal: this.numero(detalle.subtotal),
        })),
        pagos: venta.pagos.map((pago) => ({
          metodo: pago.metodoPago.nombre,
          monto: this.numero(pago.monto),
          devuelto: pago.devoluciones.reduce(
            (sum, item) => sum + this.numero(item.monto),
            0,
          ),
        })),
      })),
      compras: facturasProveedor.map((item) => ({
        ...item,
        total: this.numero(item.total),
        saldo: this.numero(item.saldo),
      })),
      pagosProveedores: abonosProveedor.map((item) => ({
        ...item,
        monto: this.numero(item.monto),
      })),
      egresosCaja: egresosCaja.map((item) => ({
        ...item,
        monto: this.numero(item.monto),
      })),
      cierres: cierres.map((item) => ({
        ...item,
        saldoInicial: this.numero(item.saldoInicial),
        saldoEsperado: this.numero(item.saldoEsperado),
        saldoContado: this.numero(item.saldoContado),
        diferencia: this.numero(item.diferencia),
        totalIngresos: this.numero(item.totalIngresos),
        totalEgresos: this.numero(item.totalEgresos),
      })),
    };
  }

  async libro(
    sucursalId: number,
    desde: string,
    hasta: string,
    usuario: UsuarioAutenticado,
  ) {
    await this.validarSucursal(sucursalId, usuario);
    const { inicio, fin, zonaHoraria } = await this.rango(
      sucursalId,
      desde,
      hasta,
    );
    const ventaWhere: Prisma.VentaWhereInput = {
      sucursalId,
      fechaOperacion: { gte: inicio, lte: fin },
      estado: { not: EstadoVenta.ANULADA },
    };

    const [ventas, compras, pagosProveedores, egresosCaja] = await Promise.all([
      this.prisma.venta.findMany({
        where: ventaWhere,
        orderBy: { fechaOperacion: 'asc' },
        select: {
          id: true,
          fechaOperacion: true,
          estado: true,
          origen: true,
          total: true,
          pedido: { select: { mesa: { select: { numero: true } } } },
          detalles: {
            select: {
              cantidad: true,
              precioUnitario: true,
              subtotal: true,
              producto: { select: { nombre: true } },
            },
          },
          pagos: {
            select: {
              monto: true,
              metodoPago: { select: { nombre: true } },
              devoluciones: { select: { monto: true } },
            },
          },
        },
      }),
      this.prisma.facturaProveedor.findMany({
        where: { sucursalId, fechaEmision: { gte: inicio, lte: fin } },
        orderBy: { fechaEmision: 'asc' },
        select: {
          id: true,
          numero: true,
          fechaEmision: true,
          total: true,
          saldo: true,
          estado: true,
          proveedor: { select: { nombre: true } },
        },
      }),
      this.prisma.abonoFacturaProveedor.findMany({
        where: {
          fecha: { gte: inicio, lte: fin },
          factura: { sucursalId },
        },
        orderBy: { fecha: 'asc' },
        select: {
          id: true,
          fecha: true,
          monto: true,
          metodo: true,
          referencia: true,
          factura: {
            select: {
              numero: true,
              proveedor: { select: { nombre: true } },
            },
          },
        },
      }),
      this.prisma.movimientoCaja.findMany({
        where: {
          tipo: TipoMovimientoCaja.EGRESO,
          creadoEn: { gte: inicio, lte: fin },
          caja: { sucursalId },
        },
        orderBy: { creadoEn: 'asc' },
        select: {
          id: true,
          creadoEn: true,
          monto: true,
          concepto: true,
          observacion: true,
          caja: { select: { nombre: true } },
        },
      }),
    ]);

    const totalesPorDia = new Map<string, number>();
    for (const venta of ventas) {
      const clave = this.claveDia(venta.fechaOperacion, zonaHoraria);
      totalesPorDia.set(
        clave,
        (totalesPorDia.get(clave) ?? 0) + this.numero(venta.total),
      );
    }

    const rows: Record<string, unknown>[] = [];
    for (const [fecha, total] of [...totalesPorDia.entries()].sort()) {
      rows.push({
        tipo: 'RESUMEN_DIA',
        fecha,
        documento: '',
        contraparte: '',
        detalle: 'Total vendido del día',
        cantidad: '',
        precioUnitario: '',
        subtotal: '',
        entrada: total,
        salida: '',
        medio: '',
        referencia: '',
        totalDocumento: total,
      });
    }
    for (const venta of ventas) {
      const medios = venta.pagos
        .map((pago) => `${pago.metodoPago.nombre}: ${this.numero(pago.monto)}`)
        .join(' | ');
      for (const detalle of venta.detalles) {
        rows.push({
          tipo: 'VENTA_PRODUCTO',
          fecha: venta.fechaOperacion,
          documento: `Venta #${venta.id}`,
          contraparte: venta.pedido?.mesa?.numero
            ? `Mesa ${venta.pedido.mesa.numero}`
            : '',
          detalle: detalle.producto.nombre,
          cantidad: detalle.cantidad,
          precioUnitario: this.numero(detalle.precioUnitario),
          subtotal: this.numero(detalle.subtotal),
          entrada: this.numero(detalle.subtotal),
          salida: '',
          medio: medios,
          referencia: `${venta.origen} · ${venta.estado}`,
          totalDocumento: this.numero(venta.total),
        });
      }
    }
    for (const compra of compras) {
      rows.push({
        tipo: 'COMPRA_PROVEEDOR',
        fecha: compra.fechaEmision,
        documento: `Factura proveedor ${compra.numero}`,
        contraparte: compra.proveedor.nombre,
        detalle: `Compra / obligación · ${compra.estado}`,
        cantidad: '',
        precioUnitario: '',
        subtotal: '',
        entrada: '',
        salida: this.numero(compra.total),
        medio: '',
        referencia: `Saldo ${this.numero(compra.saldo)}`,
        totalDocumento: this.numero(compra.total),
      });
    }
    for (const pago of pagosProveedores) {
      rows.push({
        tipo: 'PAGO_PROVEEDOR',
        fecha: pago.fecha,
        documento: `Pago proveedor #${pago.id}`,
        contraparte: pago.factura.proveedor.nombre,
        detalle: `Abono factura ${pago.factura.numero}`,
        cantidad: '',
        precioUnitario: '',
        subtotal: '',
        entrada: '',
        salida: this.numero(pago.monto),
        medio: pago.metodo,
        referencia: pago.referencia ?? '',
        totalDocumento: this.numero(pago.monto),
      });
    }
    for (const egreso of egresosCaja) {
      rows.push({
        tipo: 'EGRESO_CAJA',
        fecha: egreso.creadoEn,
        documento: `Movimiento caja #${egreso.id}`,
        contraparte: egreso.caja.nombre,
        detalle: egreso.concepto,
        cantidad: '',
        precioUnitario: '',
        subtotal: '',
        entrada: '',
        salida: this.numero(egreso.monto),
        medio: 'CAJA',
        referencia: egreso.observacion ?? '',
        totalDocumento: this.numero(egreso.monto),
      });
    }

    return {
      zonaHoraria,
      rows: rows.sort((a, b) =>
        String(a.fecha).localeCompare(String(b.fecha)),
      ),
    };
  }
}
