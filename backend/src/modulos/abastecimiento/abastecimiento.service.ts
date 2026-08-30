import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoMovimientoInventario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  ConvertirSolicitudDto,
  CrearProveedorDto,
  CrearSolicitudCompraDto,
  PrecioProveedorDto,
  RecibirOrdenDto,
} from './dto/abastecimiento.dto';

@Injectable()
export class AbastecimientoService {
  constructor(private readonly prisma: PrismaService) {}

  async proveedores(usuario: UsuarioAutenticado) {
    const restauranteId = this.restaurante(usuario);
    return this.prisma.proveedor.findMany({
      where: { restauranteId, estado: true },
      include: {
        articulos: {
          include: { articulo: { select: { nombre: true, unidad: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  crearProveedor(data: CrearProveedorDto, usuario: UsuarioAutenticado) {
    return this.prisma.proveedor.create({
      data: { ...data, restauranteId: this.restaurante(usuario) },
    });
  }

  async guardarPrecio(
    proveedorId: number,
    data: PrecioProveedorDto,
    usuario: UsuarioAutenticado,
  ) {
    const proveedor = await this.proveedorEnAlcance(proveedorId, usuario);
    const articulo = await this.prisma.articulo.findFirst({
      where: {
        id: data.articuloId,
        sucursal: { restauranteId: proveedor.restauranteId },
      },
    });
    if (!articulo) throw new NotFoundException('Insumo no encontrado');
    return this.prisma.proveedorArticulo.upsert({
      where: {
        proveedorId_articuloId: { proveedorId, articuloId: data.articuloId },
      },
      update: { precio: data.precio, codigo: data.codigo },
      create: { proveedorId, ...data },
    });
  }

  async solicitudes(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    return this.prisma.solicitudCompra.findMany({
      where: { sucursalId },
      include: {
        proveedor: true,
        detalles: { include: { articulo: true } },
        orden: true,
      },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async crearSolicitud(
    data: CrearSolicitudCompraDto,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.sucursalEnAlcance(data.sucursalId, usuario);
    if (data.proveedorId)
      await this.proveedorEnAlcance(data.proveedorId, usuario);
    const ids = [
      ...new Set(data.detalles.map((detalle) => detalle.articuloId)),
    ];
    const articulos = await this.prisma.articulo.count({
      where: { id: { in: ids }, sucursalId: sucursal.id, estado: true },
    });
    if (articulos !== ids.length)
      throw new BadRequestException('La solicitud contiene insumos inválidos');
    return this.prisma.solicitudCompra.create({
      data: {
        sucursalId: sucursal.id,
        proveedorId: data.proveedorId,
        creadoPorId: usuario.id,
        observaciones: data.observaciones,
        detalles: { create: data.detalles },
      },
      include: { detalles: { include: { articulo: true } }, proveedor: true },
    });
  }

  async convertir(
    id: number,
    data: ConvertirSolicitudDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const solicitud = await tx.solicitudCompra.findUnique({
        where: { id },
        include: { sucursal: true, detalles: true },
      });
      if (!solicitud) throw new NotFoundException('Solicitud no encontrada');
      this.validarAlcance(
        solicitud.sucursal.restauranteId,
        solicitud.sucursalId,
        usuario,
      );
      if (solicitud.estado !== 'PENDIENTE')
        throw new BadRequestException('La solicitud ya fue procesada');
      const proveedorId = data.proveedorId ?? solicitud.proveedorId;
      if (!proveedorId)
        throw new BadRequestException('Debe seleccionar un proveedor');
      const proveedor = await tx.proveedor.findFirst({
        where: {
          id: proveedorId,
          restauranteId: solicitud.sucursal.restauranteId,
          estado: true,
        },
      });
      if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
      const precios = await tx.proveedorArticulo.findMany({
        where: {
          proveedorId,
          articuloId: { in: solicitud.detalles.map((d) => d.articuloId) },
        },
      });
      if (precios.length !== solicitud.detalles.length)
        throw new BadRequestException(
          'Faltan precios del proveedor para uno o más insumos',
        );
      const porArticulo = new Map(
        precios.map((precio) => [precio.articuloId, precio.precio]),
      );
      const detalles = solicitud.detalles.map((detalle) => {
        const precioUnitario = porArticulo.get(detalle.articuloId);
        if (!precioUnitario)
          throw new BadRequestException('Precio de proveedor no encontrado');
        return {
          articuloId: detalle.articuloId,
          cantidadPedida: detalle.cantidad,
          precioUnitario,
        };
      });
      const totalEstimado = detalles.reduce(
        (total, detalle) =>
          total.plus(detalle.cantidadPedida.mul(detalle.precioUnitario)),
        new Prisma.Decimal(0),
      );
      const orden = await tx.ordenCompra.create({
        data: {
          sucursalId: solicitud.sucursalId,
          proveedorId,
          solicitudId: solicitud.id,
          creadoPorId: usuario.id,
          observaciones: solicitud.observaciones,
          totalEstimado,
          detalles: { create: detalles },
        },
        include: { detalles: { include: { articulo: true } }, proveedor: true },
      });
      await tx.solicitudCompra.update({
        where: { id },
        data: { estado: 'CONVERTIDA', proveedorId },
      });
      return orden;
    });
  }

  async ordenes(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    return this.prisma.ordenCompra.findMany({
      where: { sucursalId },
      include: {
        proveedor: true,
        detalles: { include: { articulo: true } },
        recepciones: { include: { detalles: true } },
      },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async recibir(
    id: number,
    data: RecibirOrdenDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const orden = await tx.ordenCompra.findUnique({
        where: { id },
        include: { sucursal: true, detalles: { include: { articulo: true } } },
      });
      if (!orden) throw new NotFoundException('Orden no encontrada');
      this.validarAlcance(
        orden.sucursal.restauranteId,
        orden.sucursalId,
        usuario,
      );
      if (!['ABIERTA', 'PARCIAL'].includes(orden.estado))
        throw new BadRequestException('La orden no admite recepciones');
      const detallePorId = new Map(
        orden.detalles.map((detalle) => [detalle.id, detalle]),
      );
      const recibidos = data.detalles.map((linea) => {
        const detalle = detallePorId.get(linea.detalleOrdenId);
        if (!detalle)
          throw new BadRequestException('Detalle de orden inválido');
        const cantidad = new Prisma.Decimal(linea.cantidad);
        const acumulado = detalle.cantidadRecibida.plus(cantidad);
        if (acumulado.gt(detalle.cantidadPedida))
          throw new BadRequestException(
            `La recepción supera lo pedido para ${detalle.articulo.nombre}`,
          );
        return {
          detalle,
          cantidad,
          acumulado,
          diferencia: acumulado.minus(detalle.cantidadPedida),
        };
      });
      const recepcion = await tx.recepcionCompra.create({
        data: {
          ordenId: orden.id,
          sucursalId: orden.sucursalId,
          recibidoPorId: usuario.id,
          documento: data.documento,
          observaciones: data.observaciones,
          detalles: {
            create: recibidos.map(({ detalle, cantidad, diferencia }) => ({
              detalleOrdenId: detalle.id,
              articuloId: detalle.articuloId,
              cantidad,
              diferencia,
            })),
          },
        },
      });
      for (const item of recibidos) {
        const stockAnterior = item.detalle.articulo.stock;
        const articulo = await tx.articulo.update({
          where: { id: item.detalle.articuloId },
          data: {
            stock: { increment: item.cantidad },
            costoUnidad: item.detalle.precioUnitario,
          },
        });
        await tx.detalleOrdenCompra.update({
          where: { id: item.detalle.id },
          data: { cantidadRecibida: item.acumulado },
        });
        await tx.movimientoInventario.create({
          data: {
            tipo: TipoMovimientoInventario.ENTRADA,
            cantidad: item.cantidad,
            unidad: item.detalle.articulo.unidad,
            stockAnterior,
            stockNuevo: articulo.stock,
            motivo: `Recepción orden de compra #${orden.id}`,
            sucursalId: orden.sucursalId,
            usuarioId: usuario.id,
            articuloId: item.detalle.articuloId,
            recepcionCompraId: recepcion.id,
          },
        });
      }
      const estadoDetalles = await tx.detalleOrdenCompra.findMany({
        where: { ordenId: orden.id },
        select: { cantidadPedida: true, cantidadRecibida: true },
      });
      const completa = estadoDetalles.every((detalle) =>
        detalle.cantidadRecibida.gte(detalle.cantidadPedida),
      );
      await tx.ordenCompra.update({
        where: { id: orden.id },
        data: { estado: completa ? 'RECIBIDA' : 'PARCIAL' },
      });
      return tx.recepcionCompra.findUniqueOrThrow({
        where: { id: recepcion.id },
        include: {
          detalles: { include: { articulo: true, detalleOrden: true } },
        },
      });
    });
  }

  private restaurante(usuario: UsuarioAutenticado) {
    if (usuario.restauranteId === null)
      throw new ForbiddenException('Se requiere contexto de restaurante');
    return usuario.restauranteId;
  }
  private async proveedorEnAlcance(id: number, usuario: UsuarioAutenticado) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id, restauranteId: this.restaurante(usuario), estado: true },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado');
    return proveedor;
  }
  private async sucursalEnAlcance(id: number, usuario: UsuarioAutenticado) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id,
        restauranteId: this.restaurante(usuario),
        ...(usuario.sucursalId ? { id: usuario.sucursalId } : {}),
      },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }
  private validarAlcance(
    restauranteId: number,
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    if (
      this.restaurante(usuario) !== restauranteId ||
      (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId)
    )
      throw new ForbiddenException('Recurso fuera del alcance');
  }
}
