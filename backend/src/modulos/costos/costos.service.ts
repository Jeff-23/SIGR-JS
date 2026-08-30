import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoVenta,
  Prisma,
  TipoMovimientoInventario,
  UnidadInventario,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { convertirUnidad } from '../inventario/inventario-unidades.util';
import { FiltroRentabilidadDto } from './dto/costos.dto';

type History = {
  creadoEn: Date;
  costoAnterior: Prisma.Decimal;
  costoNuevo: Prisma.Decimal;
};
type ProductCost = {
  id: number;
  nombre: string;
  precio: Prisma.Decimal;
  rendimientoPorcentaje: Prisma.Decimal;
  categoria: { id: number; nombre: string };
  recetas: Array<{
    cantidad: Prisma.Decimal;
    unidad: UnidadInventario;
    articulo: {
      id: number;
      nombre: string;
      unidad: UnidadInventario;
      costoUnidad: Prisma.Decimal;
    };
  }>;
};

@Injectable()
export class CostosService {
  constructor(private readonly prisma: PrismaService) {}

  async recetas(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursal(sucursalId, usuario);
    const productos = await this.prisma.producto.findMany({
      where: { estado: true, categoria: { sucursalId } },
      include: {
        categoria: { select: { id: true, nombre: true } },
        recetas: { include: { articulo: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return productos.map((producto) => this.costearProducto(producto));
  }

  async rendimiento(
    productoId: number,
    porcentaje: number,
    usuario: UsuarioAutenticado,
  ) {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      include: { categoria: { include: { sucursal: true } } },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    this.alcance(
      producto.categoria.sucursal.restauranteId,
      producto.categoria.sucursalId,
      usuario,
    );
    return this.prisma.producto.update({
      where: { id: productoId },
      data: { rendimientoPorcentaje: porcentaje },
    });
  }

  async historial(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursal(sucursalId, usuario);
    return this.prisma.historialCostoArticulo.findMany({
      where: { articulo: { sucursalId } },
      include: {
        articulo: { select: { nombre: true, unidad: true } },
        recepcion: { select: { id: true, documento: true } },
      },
      orderBy: { creadoEn: 'desc' },
      take: 300,
    });
  }

  async rentabilidad(
    filtro: FiltroRentabilidadDto,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.sucursal(filtro.sucursalId, usuario);
    if (filtro.desde > filtro.hasta)
      throw new BadRequestException('El periodo no es válido');
    const hastaExclusivo = new Date(filtro.hasta);
    hastaExclusivo.setDate(hastaExclusivo.getDate() + 1);
    const [ventas, productos, historiales, mermas] = await Promise.all([
      this.prisma.detalleVenta.findMany({
        where: {
          venta: {
            sucursalId: filtro.sucursalId,
            estado: { not: EstadoVenta.ANULADA },
            fechaOperacion: { gte: filtro.desde, lt: hastaExclusivo },
          },
        },
        include: {
          venta: { select: { fechaOperacion: true } },
          producto: { include: { categoria: true } },
        },
      }),
      this.prisma.producto.findMany({
        where: { categoria: { sucursalId: filtro.sucursalId } },
        include: { categoria: true, recetas: { include: { articulo: true } } },
      }),
      this.prisma.historialCostoArticulo.findMany({
        where: { articulo: { sucursalId: filtro.sucursalId } },
        orderBy: { creadoEn: 'asc' },
      }),
      this.prisma.movimientoInventario.findMany({
        where: {
          sucursalId: filtro.sucursalId,
          tipo: TipoMovimientoInventario.MERMA,
          creadoEn: { gte: filtro.desde, lt: hastaExclusivo },
          articuloId: { not: null },
        },
        include: { articulo: true },
      }),
    ]);
    const histories = new Map<number, History[]>();
    for (const history of historiales)
      histories.set(history.articuloId, [
        ...(histories.get(history.articuloId) ?? []),
        history,
      ]);
    const productMap = new Map(
      productos.map((product) => [product.id, product]),
    );
    const rows = new Map<
      number,
      {
        productoId: number;
        producto: string;
        categoriaId: number;
        categoria: string;
        ingresos: Prisma.Decimal;
        costoTeorico: Prisma.Decimal;
        costoRendimiento: Prisma.Decimal;
        unidades: number;
      }
    >();
    for (const detail of ventas) {
      const product = productMap.get(detail.productoId);
      if (!product) continue;
      let unitTheoretical = new Prisma.Decimal(0);
      for (const recipe of product.recetas) {
        const quantity = convertirUnidad(
          recipe.cantidad,
          recipe.unidad,
          recipe.articulo.unidad,
        );
        unitTheoretical = unitTheoretical.plus(
          quantity.mul(
            this.costAt(
              recipe.articulo.costoUnidad,
              histories.get(recipe.articuloId) ?? [],
              detail.venta.fechaOperacion,
            ),
          ),
        );
      }
      const performance = new Prisma.Decimal(product.rendimientoPorcentaje).div(
        100,
      );
      const current = rows.get(product.id) ?? {
        productoId: product.id,
        producto: product.nombre,
        categoriaId: product.categoria.id,
        categoria: product.categoria.nombre,
        ingresos: new Prisma.Decimal(0),
        costoTeorico: new Prisma.Decimal(0),
        costoRendimiento: new Prisma.Decimal(0),
        unidades: 0,
      };
      current.ingresos = current.ingresos.plus(detail.subtotal);
      current.costoTeorico = current.costoTeorico.plus(
        unitTheoretical.mul(detail.cantidad),
      );
      current.costoRendimiento = current.costoRendimiento.plus(
        unitTheoretical.div(performance).mul(detail.cantidad),
      );
      current.unidades += detail.cantidad;
      rows.set(product.id, current);
    }
    const costoMerma = mermas.reduce(
      (total, movement) =>
        movement.articulo
          ? total.plus(
              movement.cantidad.mul(
                this.costAt(
                  movement.articulo.costoUnidad,
                  histories.get(movement.articuloId ?? 0) ?? [],
                  movement.creadoEn,
                ),
              ),
            )
          : total,
      new Prisma.Decimal(0),
    );
    const totalTheoretical = [...rows.values()].reduce(
      (total, row) => total.plus(row.costoTeorico),
      new Prisma.Decimal(0),
    );
    const productosResultado = [...rows.values()].map((row) => {
      const share = totalTheoretical.gt(0)
        ? row.costoTeorico.div(totalTheoretical)
        : new Prisma.Decimal(0);
      const costoReal = row.costoRendimiento.plus(costoMerma.mul(share));
      const margen = row.ingresos.minus(costoReal);
      return {
        ...row,
        costoReal,
        margen,
        margenPorcentaje: row.ingresos.gt(0)
          ? margen.div(row.ingresos).mul(100)
          : new Prisma.Decimal(0),
      };
    });
    const categories = new Map<
      number,
      {
        categoriaId: number;
        categoria: string;
        ingresos: Prisma.Decimal;
        costoTeorico: Prisma.Decimal;
        costoReal: Prisma.Decimal;
        margen: Prisma.Decimal;
      }
    >();
    for (const row of productosResultado) {
      const current = categories.get(row.categoriaId) ?? {
        categoriaId: row.categoriaId,
        categoria: row.categoria,
        ingresos: new Prisma.Decimal(0),
        costoTeorico: new Prisma.Decimal(0),
        costoReal: new Prisma.Decimal(0),
        margen: new Prisma.Decimal(0),
      };
      current.ingresos = current.ingresos.plus(row.ingresos);
      current.costoTeorico = current.costoTeorico.plus(row.costoTeorico);
      current.costoReal = current.costoReal.plus(row.costoReal);
      current.margen = current.margen.plus(row.margen);
      categories.set(row.categoriaId, current);
    }
    const totals = productosResultado.reduce(
      (total, row) => ({
        ingresos: total.ingresos.plus(row.ingresos),
        costoTeorico: total.costoTeorico.plus(row.costoTeorico),
        costoReal: total.costoReal.plus(row.costoReal),
        margen: total.margen.plus(row.margen),
      }),
      {
        ingresos: new Prisma.Decimal(0),
        costoTeorico: new Prisma.Decimal(0),
        costoReal: new Prisma.Decimal(0),
        margen: new Prisma.Decimal(0),
      },
    );
    return {
      sucursal: { id: sucursal.id, nombre: sucursal.nombre },
      periodo: { desde: filtro.desde, hasta: filtro.hasta },
      costoMerma,
      totales: {
        ...totals,
        margenPorcentaje: totals.ingresos.gt(0)
          ? totals.margen.div(totals.ingresos).mul(100)
          : 0,
      },
      productos: productosResultado,
      categorias: [...categories.values()],
    };
  }

  private costearProducto(product: ProductCost) {
    const ingredientes = product.recetas.map((recipe) => {
      const cantidadBase = convertirUnidad(
        recipe.cantidad,
        recipe.unidad,
        recipe.articulo.unidad,
      );
      return {
        articuloId: recipe.articulo.id,
        articulo: recipe.articulo.nombre,
        cantidad: recipe.cantidad,
        unidad: recipe.unidad,
        costo: cantidadBase.mul(recipe.articulo.costoUnidad),
      };
    });
    const costoTeorico = ingredientes.reduce(
      (total, ingredient) => total.plus(ingredient.costo),
      new Prisma.Decimal(0),
    );
    const costoRealEstimado = costoTeorico.div(
      product.rendimientoPorcentaje.div(100),
    );
    return {
      productoId: product.id,
      producto: product.nombre,
      categoria: product.categoria,
      precioVenta: product.precio,
      rendimientoPorcentaje: product.rendimientoPorcentaje,
      costoTeorico,
      costoRealEstimado,
      margenUnitario: product.precio.minus(costoRealEstimado),
      ingredientes,
    };
  }
  private costAt(current: Prisma.Decimal, histories: History[], date: Date) {
    const candidates = histories.filter((history) => history.creadoEn <= date);
    const applicable = candidates[candidates.length - 1];
    if (applicable) return applicable.costoNuevo;
    return histories[0]?.costoAnterior ?? current;
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
