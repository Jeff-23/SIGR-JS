import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFacturaDto } from './dto/create-factura.dto';

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
          resolucionDian: data.resolucionDian || '18760000001', // Resolución por defecto
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
}
