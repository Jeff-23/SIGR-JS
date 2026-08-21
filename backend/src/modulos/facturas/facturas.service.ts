import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoVenta, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateFacturaDto } from './dto/create-factura.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class FacturasService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  /*
   * =====================================================
   * AISLAMIENTO MULTITENANT
   * =====================================================
   *
   * Restaurante -> Sucursal.
   */
  private filtroSucursal(
    usuarioActual: UsuarioAutenticado,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      restaurante: {
        estado: true,

        ...(!this.esSuperadmin(usuarioActual)
          ? {
              id: usuarioActual.restauranteId,
            }
          : {}),
      },

      ...(usuarioActual.sucursalId !== null
        ? {
            id: usuarioActual.sucursalId,
          }
        : {}),
    };
  }

  /*
   * =====================================================
   * FLUJO LEGACY RETIRADO
   * =====================================================
   *
   * Anteriormente:
   *
   * Pedido
   * -> Factura
   * -> Pago ligado a Factura
   * -> Pedido FACTURADO
   * -> Mesa LIBRE
   *
   * Ese comportamiento entra en conflicto con
   * el nucleo comercial vigente:
   *
   * Pedido
   * -> Venta
   * -> Pago
   * -> Venta PAGADA
   * -> Mesa LIBRE
   *
   * Las relaciones antiguas de Prisma se mantienen
   * temporalmente para consultar información histórica,
   * pero ya no se generan nuevas operaciones legacy.
   */
  createLegacy(
    _data: CreateFacturaDto,

    _usuarioActual: UsuarioAutenticado,
  ): never {
    void _data;
    void _usuarioActual;
    throw new BadRequestException(
      'El flujo Pedido -> Factura -> Pago fue retirado. Primero debe generar la Venta del pedido, registrar sus pagos y emitir la Factura desde la Venta.',
    );
  }

  /*
   * =====================================================
   * FLUJO VIGENTE
   * =====================================================
   *
   * Venta -> Factura
   *
   * Responsabilidades:
   *
   * Factura:
   * - documenta la Venta
   *
   * Venta:
   * - representa la operación comercial
   *
   * Pago:
   * - representa el dinero recibido
   *
   * Mesa:
   * - se libera exclusivamente por el flujo
   *   comercial de Venta/Pago
   *
   * Crear una Factura:
   *
   * NO crea pagos.
   * NO libera mesas.
   * NO cambia EstadoVenta.
   * NO cambia EstadoPedido.
   */
  async crearDesdeVenta(
    ventaId: number,

    usuarioActual: UsuarioAutenticado,
  ) {
    const facturaId = await this.prisma.transaccionSerializable(async (tx) => {
      const ventaAlcanzable = await tx.venta.findFirst({
        where: {
          id: ventaId,
          sucursal: this.filtroSucursal(usuarioActual),
        },
        select: { id: true },
      });

      if (!ventaAlcanzable) {
        throw new NotFoundException('Venta no encontrada');
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Venta" WHERE "id" = ${ventaAlcanzable.id} FOR UPDATE`,
      );

      const venta = await tx.venta.findUniqueOrThrow({
        where: {
          id: ventaAlcanzable.id,
        },

        include: { factura: { select: { id: true } } },
      });

      if (venta.estado === EstadoVenta.ANULADA) {
        throw new BadRequestException('No se puede facturar una venta anulada');
      }

      if (venta.factura) {
        return venta.factura.id;
      }

      /*
       * La Factura puede emitirse tanto para
       * una Venta PENDIENTE_PAGO como PAGADA.
       *
       * Esto es intencional:
       *
       * facturación y recaudo son dominios
       * independientes.
       *
       * En ningún caso emitir la factura
       * cambia el estado del pago o de la mesa.
       */

      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { id: venta.sucursalId },
        select: { restauranteId: true },
      });
      const configSucursal = await tx.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: {
            sucursalId: venta.sucursalId,
            clave: 'PREFIJO_FACTURA',
          },
        },
      });
      const configRestaurante = await tx.configuracionRestaurante.findUnique({
        where: {
          restauranteId_clave: {
            restauranteId: sucursal.restauranteId,
            clave: 'PREFIJO_FACTURA',
          },
        },
      });
      const valorPrefijo = configSucursal?.valor ?? configRestaurante?.valor;
      const prefijo = typeof valorPrefijo === 'string' ? valorPrefijo : 'FAC';
      const numeroFactura = `${prefijo}-${venta.sucursalId}-${venta.id}`;

      const factura = await tx.factura.create({
        data: {
          numero: numeroFactura,

          total: venta.total,

          ventaId: venta.id,

          /*
           * Si la Venta nació desde un Pedido,
           * conservamos también la referencia.
           *
           * Para:
           *
           * DIRECTA
           * MANUAL_CIERRE
           *
           * pedidoId permanece null.
           */
          pedidoId: venta.pedidoId,
        },

        select: { id: true },
      });

      const instantanea = await tx.venta.findUniqueOrThrow({
        where: { id: venta.id },
        include: {
          detalles: { include: { producto: { select: { nombre: true } } } },
          pagos: { include: { metodoPago: { select: { nombre: true } } } },
        },
      });
      await tx.registroFacturaOperativa.create({
        data: {
          numero: numeroFactura,
          numeroComanda: instantanea.numeroComandaPapel,
          numeroSoporte: instantanea.numeroSoporte,
          origen: 'SISTEMA',
          fechaOperacion: instantanea.fechaOperacion,
          subtotal: instantanea.subtotal,
          descuentos: instantanea.descuentos,
          impuestos: instantanea.impuestos.add(instantanea.impoconsumo),
          propina: instantanea.propina,
          domicilio: instantanea.domicilioCosto,
          total: instantanea.total,
          detalles: instantanea.detalles.map((detalle) => ({
            nombre: detalle.producto.nombre,
            cantidad: detalle.cantidad,
            precioUnitario: detalle.precioUnitario.toString(),
            total: detalle.subtotal.toString(),
          })),
          impuestosDetalle: [
            { nombre: 'Impuestos', monto: instantanea.impuestos.toString() },
            {
              nombre: 'Impoconsumo',
              monto: instantanea.impoconsumo.toString(),
            },
          ],
          formasPago: instantanea.pagos.map((pago) => ({
            nombre: pago.metodoPago.nombre,
            monto: pago.monto.toString(),
          })),
          soporteArchivoRef: instantanea.soporteArchivoRef,
          restauranteId: sucursal.restauranteId,
          sucursalId: instantanea.sucursalId,
          digitadoPorId: usuarioActual.id,
          ventaId: instantanea.id,
          facturaId: factura.id,
        },
      });
      return factura.id;
    });

    return this.prisma.factura.findUniqueOrThrow({
      where: { id: facturaId },
      include: {
        venta: {
          include: {
            detalles: { include: { producto: true } },
            pagos: { include: { metodoPago: true } },
            pedido: { include: { mesa: { include: { zona: true } } } },
          },
        },
      },
    });
  }

  listar(usuarioActual: UsuarioAutenticado) {
    return this.prisma.factura.findMany({
      where: { venta: { sucursal: this.filtroSucursal(usuarioActual) } },
      include: {
        venta: {
          select: { estado: true, fechaOperacion: true, cliente: true },
        },
        documentoElectronico: {
          select: { estado: true, numeroCompleto: true },
        },
      },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
  }

  async obtener(id: number, usuarioActual: UsuarioAutenticado) {
    const factura = await this.prisma.factura.findFirst({
      where: { id, venta: { sucursal: this.filtroSucursal(usuarioActual) } },
      include: {
        venta: {
          include: {
            sucursal: { include: { restaurante: true } },
            cliente: true,
            detalles: { include: { producto: true } },
            pagos: { include: { metodoPago: true } },
          },
        },
        documentoElectronico: true,
      },
    });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    return factura;
  }

  async representacionImpresa(id: number, usuarioActual: UsuarioAutenticado) {
    const factura = await this.obtener(id, usuarioActual);
    if (!factura.venta) {
      throw new BadRequestException('Factura histórica no representable');
    }
    const venta = factura.venta;
    const [
      configMonedaSucursal,
      configMonedaRestaurante,
      configZonaSucursal,
      configZonaRestaurante,
    ] = await Promise.all([
      this.prisma.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: {
            sucursalId: venta.sucursalId,
            clave: 'MONEDA',
          },
        },
      }),
      this.prisma.configuracionRestaurante.findUnique({
        where: {
          restauranteId_clave: {
            restauranteId: venta.sucursal.restauranteId,
            clave: 'MONEDA',
          },
        },
      }),
      this.prisma.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: {
            sucursalId: venta.sucursalId,
            clave: 'ZONA_HORARIA',
          },
        },
      }),
      this.prisma.configuracionRestaurante.findUnique({
        where: {
          restauranteId_clave: {
            restauranteId: venta.sucursal.restauranteId,
            clave: 'ZONA_HORARIA',
          },
        },
      }),
    ]);
    const valorMoneda =
      configMonedaSucursal?.valor ?? configMonedaRestaurante?.valor ?? 'COP';
    const moneda = typeof valorMoneda === 'string' ? valorMoneda : 'COP';
    const valorZona =
      configZonaSucursal?.valor ??
      configZonaRestaurante?.valor ??
      'America/Bogota';
    const zonaHoraria =
      typeof valorZona === 'string' ? valorZona : 'America/Bogota';
    const fechaLocal = new Intl.DateTimeFormat('es-CO', {
      timeZone: zonaHoraria,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(venta.fechaOperacion);
    const esc = (valor: string | number | null | undefined) =>
      String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const filas = venta.detalles
      .map(
        (d) =>
          `<tr><td>${esc(d.producto.nombre)}</td><td>${d.cantidad}</td><td>${d.precioUnitario.toFixed(2)}</td><td>${d.subtotal.toFixed(2)}</td></tr>`,
      )
      .join('');
    const electronico = factura.documentoElectronico;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(factura.numero)}</title><style>body{font-family:monospace;max-width:80mm;margin:auto}table{width:100%;border-collapse:collapse}td,th{text-align:right;padding:2px}td:first-child,th:first-child{text-align:left}</style></head><body><h1>${esc(venta.sucursal.restaurante.nombre)}</h1><p>NIT ${esc(venta.sucursal.restaurante.nit)}<br>${esc(venta.sucursal.nombre)}<br>Factura ${esc(factura.numero)}<br>${esc(fechaLocal)} (${esc(zonaHoraria)})</p><table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${filas}</tbody></table><p>Subtotal: ${venta.subtotal.toFixed(2)}<br>Impuestos: ${venta.impuestos.toFixed(2)}<br>Impoconsumo: ${venta.impoconsumo.toFixed(2)}<br>Domicilio: ${venta.domicilioCosto.toFixed(2)}<br>Propina: ${venta.propina.toFixed(2)}<br><strong>Total: ${venta.total.toFixed(2)} ${esc(moneda)}</strong></p>${electronico?.estado === 'ACEPTADO' ? `<p>Documento electrónico ${esc(electronico.numeroCompleto)}<br>CUFE ${esc(electronico.cufe)}<br>QR ${esc(electronico.qrCode)}</p>` : '<p>Representación interna; no equivale a aceptación DIAN.</p>'}</body></html>`;
    return {
      facturaId: factura.id,
      numero: factura.numero,
      mediaType: 'text/html; charset=utf-8',
      contenido: html,
      electronicaAceptada: electronico?.estado === 'ACEPTADO',
    };
  }
}
