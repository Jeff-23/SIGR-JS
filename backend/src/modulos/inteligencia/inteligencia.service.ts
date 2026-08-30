import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoVenta, Prisma, TipoMovimientoInventario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  ConfigurarMinimoDto,
  CrearMetaDto,
  FiltroInteligenciaDto,
} from './dto/inteligencia.dto';

@Injectable()
export class InteligenciaService {
  constructor(private readonly prisma: PrismaService) {}
  async tablero(filtro: FiltroInteligenciaDto, usuario: UsuarioAutenticado) {
    await this.sucursal(filtro.sucursalId, usuario);
    const hasta = filtro.hasta ?? new Date();
    const desde = filtro.desde ?? new Date(hasta.getTime() - 30 * 86400000);
    if (desde > hasta) throw new BadRequestException('Periodo inválido');
    const historyStart = new Date(hasta.getTime() - 30 * 86400000);
    const forecastStart = new Date(hasta.getTime() - 28 * 86400000);
    const [articles, movements, sales, details, goals] = await Promise.all([
      this.prisma.articulo.findMany({
        where: { sucursalId: filtro.sucursalId, estado: true },
        include: {
          proveedores: {
            include: { proveedor: true },
            orderBy: { precio: 'asc' },
          },
        },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.movimientoInventario.findMany({
        where: {
          sucursalId: filtro.sucursalId,
          articuloId: { not: null },
          tipo: {
            in: [
              TipoMovimientoInventario.SALIDA_VENTA,
              TipoMovimientoInventario.AJUSTE_NEGATIVO,
              TipoMovimientoInventario.MERMA,
              TipoMovimientoInventario.CONSUMO_INTERNO,
            ],
          },
          creadoEn: { gte: historyStart, lte: hasta },
        },
        select: { articuloId: true, cantidad: true },
      }),
      this.prisma.venta.findMany({
        where: {
          sucursalId: filtro.sucursalId,
          estado: { not: EstadoVenta.ANULADA },
          fechaOperacion: { gte: desde, lte: hasta },
        },
        select: { total: true },
      }),
      this.prisma.detalleVenta.findMany({
        where: {
          venta: {
            sucursalId: filtro.sucursalId,
            estado: { not: EstadoVenta.ANULADA },
            fechaOperacion: { gte: forecastStart, lte: hasta },
          },
        },
        include: {
          producto: { select: { id: true, nombre: true } },
          venta: { select: { fechaOperacion: true } },
        },
      }),
      this.prisma.metaOperativa.findMany({
        where: {
          sucursalId: filtro.sucursalId,
          hasta: { gte: desde },
          desde: { lte: hasta },
        },
        orderBy: { hasta: 'asc' },
      }),
    ]);
    const consumed = new Map<number, number>();
    movements.forEach((item) =>
      consumed.set(
        item.articuloId,
        (consumed.get(item.articuloId) ?? 0) + Math.abs(Number(item.cantidad)),
      ),
    );
    const alerts = articles
      .map((article) => {
        const daily = (consumed.get(article.id) ?? 0) / 30;
        const daysLeft = daily > 0 ? Number(article.stock) / daily : null;
        const projected =
          Number(article.stock) - daily * article.diasAnticipacion;
        const suggested = Math.max(0, Number(article.stockMinimo) - projected);
        const status =
          Number(article.stock) <= Number(article.stockMinimo)
            ? 'CRITICA'
            : projected <= Number(article.stockMinimo)
              ? 'ANTICIPADA'
              : 'NORMAL';
        const supplier = article.proveedores[0];
        return {
          articuloId: article.id,
          articulo: article.nombre,
          unidad: article.unidad,
          stock: article.stock,
          stockMinimo: article.stockMinimo,
          diasAnticipacion: article.diasAnticipacion,
          consumoDiarioEstimado: daily,
          diasCobertura: daysLeft,
          nivel: status,
          sugerenciaCompra: suggested,
          proveedorSugerido: supplier
            ? {
                id: supplier.proveedorId,
                nombre: supplier.proveedor.nombre,
                precio: supplier.precio,
              }
            : null,
        };
      })
      .filter((item) => item.nivel !== 'NORMAL');
    const forecast = this.pronostico(details, forecastStart, hasta);
    const totalSales = sales.reduce(
      (sum, item) => sum.plus(item.total),
      new Prisma.Decimal(0),
    );
    const count = sales.length;
    const kpis = {
      ventasMonto: totalSales,
      ventasCantidad: count,
      ticketPromedio: count ? totalSales.div(count) : new Prisma.Decimal(0),
      alertasCriticas: alerts.filter((item) => item.nivel === 'CRITICA').length,
      alertasAnticipadas: alerts.filter((item) => item.nivel === 'ANTICIPADA')
        .length,
    };
    const metas = goals.map((goal) => {
      const current =
        goal.indicador === 'VENTAS_MONTO'
          ? Number(totalSales)
          : goal.indicador === 'VENTAS_CANTIDAD'
            ? count
            : count
              ? Number(totalSales) / count
              : 0;
      return {
        ...goal,
        actual: current,
        avancePorcentaje: Math.min(
          100,
          Number(goal.objetivo) > 0
            ? (current / Number(goal.objetivo)) * 100
            : 0,
        ),
      };
    });
    return {
      periodo: { desde, hasta },
      kpis,
      alertas: alerts,
      metas,
      pronostico: forecast,
      advertenciaPronostico:
        'Estimación orientativa basada en 28 días de ventas históricas. No constituye certeza ni reemplaza el criterio operativo.',
    };
  }
  async configurarMinimo(
    id: number,
    data: ConfigurarMinimoDto,
    usuario: UsuarioAutenticado,
  ) {
    const article = await this.prisma.articulo.findUnique({
      where: { id },
      include: { sucursal: true },
    });
    if (!article) throw new NotFoundException('Artículo no encontrado');
    this.alcance(article.sucursal.restauranteId, article.sucursalId, usuario);
    return this.prisma.articulo.update({ where: { id }, data });
  }
  async crearMeta(data: CrearMetaDto, usuario: UsuarioAutenticado) {
    await this.sucursal(data.sucursalId, usuario);
    if (data.hasta < data.desde)
      throw new BadRequestException(
        'La fecha final debe ser posterior a la inicial',
      );
    return this.prisma.metaOperativa.create({ data });
  }
  private pronostico(
    details: {
      cantidad: number;
      producto: { id: number; nombre: string };
      venta: { fechaOperacion: Date };
    }[],
    from: Date,
    to: Date,
  ) {
    const days = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / 86400000),
    );
    const products = new Map<
      number,
      { nombre: string; byDay: Map<string, number> }
    >();
    details.forEach((item) => {
      const entry = products.get(item.producto.id) ?? {
        nombre: item.producto.nombre,
        byDay: new Map<string, number>(),
      };
      const day = item.venta.fechaOperacion.toISOString().slice(0, 10);
      entry.byDay.set(day, (entry.byDay.get(day) ?? 0) + item.cantidad);
      products.set(item.producto.id, entry);
    });
    return [...products.entries()]
      .map(([productoId, item]) => {
        const values = [...item.byDay.values()];
        const total = values.reduce((a, b) => a + b, 0);
        const average = total / days;
        const variance = values.length
          ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
            days
          : 0;
        const cv = average > 0 ? Math.sqrt(variance) / average : 1;
        const confidence =
          values.length >= 18 && cv < 0.6
            ? 'ALTA'
            : values.length >= 7 && cv < 1.2
              ? 'MEDIA'
              : 'BAJA';
        return {
          productoId,
          producto: item.nombre,
          unidadesHistoricas: total,
          promedioDiario: average,
          estimacion7Dias: average * 7,
          confianza: confidence,
          baseDias: days,
        };
      })
      .sort((a, b) => b.estimacion7Dias - a.estimacion7Dias)
      .slice(0, 20);
  }
  private restaurante(usuario: UsuarioAutenticado) {
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
      this.restaurante(usuario) !== restauranteId ||
      (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId)
    )
      throw new ForbiddenException('Recurso fuera del alcance');
  }
  private async sucursal(id: number, usuario: UsuarioAutenticado) {
    const branch = await this.prisma.sucursal.findFirst({
      where: {
        id,
        restauranteId: this.restaurante(usuario),
        ...(usuario.sucursalId ? { id: usuario.sucursalId } : {}),
      },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }
}
