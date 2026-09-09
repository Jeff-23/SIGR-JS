import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoVenta, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateFacturaDto } from './dto/create-factura.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  configuracionImpresionTermica,
  dineroTermico,
  documentoTermicoHtml,
  escaparHtml,
  fechaLocalTermica,
} from '../../plataforma/impresion-termica';

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
    if (!factura.venta)
      throw new BadRequestException('Factura histórica no representable');
    const venta = factura.venta;
    const cfg = await configuracionImpresionTermica(
      this.prisma,
      venta.sucursal.restauranteId,
      venta.sucursalId,
    );
    const esc = escaparHtml;
    const filas = venta.detalles
      .map(
        (d) =>
          `<div class="row line"><span>${d.cantidad}× ${esc(d.producto.nombre)}</span><strong>${dineroTermico(d.subtotal, cfg.moneda)}</strong></div>`,
      )
      .join('');
    const pagos = venta.pagos.length
      ? `<hr class="sep"><div class="strong">PAGOS</div>${venta.pagos.map((p) => `<div class="row"><span>${esc(p.metodoPago.nombre)}</span><strong>${dineroTermico(p.monto, cfg.moneda)}</strong></div>`).join('')}`
      : '';
    const electronico = factura.documentoElectronico;
    const fiscal =
      electronico?.estado === 'ACEPTADO'
        ? `<hr class="sep"><div class="center muted">Documento electrónico aceptado<br>${esc(electronico.numeroCompleto)}<br>CUFE ${esc(electronico.cufe)}${electronico.qrCode ? `<br>QR ${esc(electronico.qrCode)}` : ''}</div>`
        : '<hr class="sep"><div class="center muted">Representación interna; no equivale a aceptación DIAN.</div>';
    const cuerpo = `<div class="center"><div class="title">FACTURA INTERNA</div><p>${esc(venta.sucursal.restaurante.nombre)}<br>NIT ${esc(venta.sucursal.restaurante.nit)}<br>${esc(venta.sucursal.nombre)}</p></div><hr class="sep"><div class="row"><span>Factura</span><strong>${esc(factura.numero)}</strong></div><div class="row"><span>Fecha</span><strong>${esc(fechaLocalTermica(venta.fechaOperacion, cfg.zonaHoraria))}</strong></div><hr class="sep">${filas}<hr class="sep"><div class="row"><span>Subtotal</span><span>${dineroTermico(venta.subtotal, cfg.moneda)}</span></div>${Number(venta.descuentos) ? `<div class="row"><span>Descuentos</span><span>-${dineroTermico(venta.descuentos, cfg.moneda)}</span></div>` : ''}${Number(venta.impuestos) ? `<div class="row"><span>Impuestos</span><span>${dineroTermico(venta.impuestos, cfg.moneda)}</span></div>` : ''}${Number(venta.impoconsumo) ? `<div class="row"><span>Impoconsumo</span><span>${dineroTermico(venta.impoconsumo, cfg.moneda)}</span></div>` : ''}${Number(venta.domicilioCosto) ? `<div class="row"><span>Domicilio</span><span>${dineroTermico(venta.domicilioCosto, cfg.moneda)}</span></div>` : ''}${Number(venta.propina) ? `<div class="row"><span>Propina</span><span>${dineroTermico(venta.propina, cfg.moneda)}</span></div>` : ''}<div class="row total"><span>TOTAL</span><span>${dineroTermico(venta.total, cfg.moneda)}</span></div>${pagos}${fiscal}`;
    return {
      facturaId: factura.id,
      numero: factura.numero,
      anchoPapel: cfg.ancho,
      mediaType: 'text/html; charset=utf-8',
      contenido: documentoTermicoHtml({
        titulo: factura.numero,
        ancho: cfg.ancho,
        cuerpo,
      }),
      electronicaAceptada: electronico?.estado === 'ACEPTADO',
    };
  }
}
