import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import * as crypto from 'crypto'; // <-- Importación nativa de Node para el CUFE

@Injectable()
export class FacturasService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateFacturaDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Buscar el pedido original y verificar que no esté facturado ya
      const pedido = await tx.pedido.findUnique({
        where: { id: data.pedidoId },
        include: { factura: true }
      });

      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.factura) throw new BadRequestException('Este pedido ya fue facturado');

      // 2. Validar que la suma de los pagos cubra el total del pedido
      const totalPedido = pedido.total.toNumber();
      const sumaPagos = data.pagos.reduce((sum, pago) => sum + pago.monto, 0);

      if (sumaPagos < totalPedido) {
        throw new BadRequestException(`El monto pagado (${sumaPagos}) es menor al total del pedido (${totalPedido})`);
      }

      // 3. Generar consecutivo de factura (Ej: SET-1, SET-2...)
      const conteo = await tx.factura.count();
      const numeroFactura = `SET-${conteo + 1}`;

      // 4. Crear Factura y asociar los Pagos
      const nuevaFactura = await tx.factura.create({
        data: {
          numero: numeroFactura,
          total: totalPedido,
          resolucionDian: data.resolucionDian || '18760000001',
          pedidoId: data.pedidoId,
          pagos: {
            create: data.pagos.map(p => ({
              monto: p.monto,
              metodoPagoId: p.metodoPagoId
            }))
          }
        },
        include: {
          pagos: true
        }
      });

      // 5. ¡LIBERAR LA MESA!
      await tx.mesa.update({
        where: { id: pedido.mesaId },
        data: { situacion: 'LIBRE' }
      });

      return nuevaFactura;
    });
  }

  // ==========================================
  // NUEVO: CORTE DE CAJA (REPORTES)
  // ==========================================
  async obtenerCorteCaja(fechaInicio?: string, fechaFin?: string) {
    // Si no mandan fechas, usamos el día de hoy desde las 00:00
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const inicio = fechaInicio ? new Date(fechaInicio) : hoy;
    const fin = fechaFin ? new Date(fechaFin) : new Date();

    const facturas = await this.prisma.factura.findMany({
      where: {
        creadoEn: {
          gte: inicio,
          lte: fin,
        },
        estado: 'EMITIDA'
      },
      include: {
        pagos: {
          include: { metodoPago: true }
        }
      }
    });

    let totalVentas = 0;
    const desglosePorMetodo: Record<string, number> = {};

    facturas.forEach(fac => {
      totalVentas += fac.total.toNumber();
      
      fac.pagos.forEach(pago => {
        const metodo = pago.metodoPago.nombre;
        const monto = pago.monto.toNumber();
        
        if (!desglosePorMetodo[metodo]) {
          desglosePorMetodo[metodo] = 0;
        }
        desglosePorMetodo[metodo] += monto;
      });
    });

    return {
      fechaInicio: inicio,
      fechaFin: fin,
      cantidadFacturas: facturas.length,
      totalVentas,
      desglosePagos: desglosePorMetodo
    };
  }

  // ==========================================
  // NUEVO: SIMULACIÓN DIAN (FIRMA ELECTRÓNICA)
  // ==========================================
  async emitirDian(id: number) {
    const factura = await this.prisma.factura.findUnique({ where: { id } });
    
    if (!factura) throw new NotFoundException('Factura no encontrada');
    if (factura.cufe) throw new BadRequestException('Esta factura ya fue transmitida a la DIAN');

    // La DIAN exige un hash SHA384 con los datos de la factura. Lo simulamos aquí:
    const dataToHash = `${factura.numero}${factura.total}${factura.resolucionDian}${factura.creadoEn.toISOString()}`;
    const cufeGenerado = crypto.createHash('sha384').update(dataToHash).digest('hex');

    // La URL oficial donde los clientes validan la factura con la DIAN
    const qrGenerado = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufeGenerado}`;

    return this.prisma.factura.update({
      where: { id },
      data: {
        cufe: cufeGenerado,
        qrCode: qrGenerado
      }
    });
  }
}