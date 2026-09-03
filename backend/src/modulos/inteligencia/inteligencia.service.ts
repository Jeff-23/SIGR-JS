import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoPedido,
  EstadoVenta,
  Prisma,
  TipoEventoOperacional,
  TipoMovimientoInventario,
} from '@prisma/client';
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
  async operacionEnVivo(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursal(sucursalId, usuario);
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const [eventos, pedidos] = await Promise.all([
      this.prisma.eventoOperacional.findMany({
        where: { sucursalId, ocurridoEn: { gte: desde } },
        orderBy: { ocurridoEn: 'asc' },
      }),
      this.prisma.pedido.findMany({
        where: {
          sucursalId,
          creadoEn: { gte: desde },
          estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.FACTURADO] },
        },
        include: {
          mesa: { select: { id: true, numero: true } },
          venta: { select: { id: true, estado: true, total: true } },
          comandas: {
            include: { estacion: true },
            orderBy: { fechaEnvio: 'asc' },
          },
        },
        orderBy: { creadoEn: 'asc' },
        take: 200,
      }),
    ]);

    const porPedido = new Map<number, typeof eventos>();
    eventos.forEach((evento) => {
      const lista = porPedido.get(evento.pedidoId) ?? [];
      lista.push(evento);
      porPedido.set(evento.pedidoId, lista);
    });
    const min = (a?: Date, b?: Date) =>
      a && b ? Math.max(0, (b.getTime() - a.getTime()) / 60000) : null;
    const primera = (lista: typeof eventos, tipo: TipoEventoOperacional) =>
      lista.find((item) => item.tipo === tipo)?.ocurridoEn;
    const ultima = (lista: typeof eventos, tipo: TipoEventoOperacional) =>
      [...lista].reverse().find((item) => item.tipo === tipo)?.ocurridoEn;
    const muestras = {
      pedidoACocina: [] as number[],
      cocinaAListo: [] as number[],
      listoARetirado: [] as number[],
      retiradoAMesa: [] as number[],
      entregaACuenta: [] as number[],
      cuentaAPago: [] as number[],
      cicloTotal: [] as number[],
    };
    for (const lista of porPedido.values()) {
      const creado = primera(lista, TipoEventoOperacional.PEDIDO_CREADO);
      const enviado = primera(lista, TipoEventoOperacional.ENVIADO_ESTACION);
      const inicio = primera(lista, TipoEventoOperacional.PREPARACION_INICIADA);
      const listo = ultima(lista, TipoEventoOperacional.LISTO_ESTACION);
      const retirado = ultima(lista, TipoEventoOperacional.RETIRADO_ESTACION);
      const entregado = primera(lista, TipoEventoOperacional.ENTREGADO_CLIENTE);
      const cuenta = primera(lista, TipoEventoOperacional.CUENTA_SOLICITADA);
      const pago = primera(lista, TipoEventoOperacional.PAGO_COMPLETADO);
      const valores = {
        pedidoACocina: min(creado, enviado),
        cocinaAListo: min(inicio, listo),
        listoARetirado: min(listo, retirado),
        retiradoAMesa: min(retirado, entregado),
        entregaACuenta: min(entregado, cuenta),
        cuentaAPago: min(cuenta, pago),
        cicloTotal: min(creado, pago),
      };
      (Object.keys(valores) as (keyof typeof valores)[]).forEach((clave) => {
        const valor = valores[clave];
        if (valor !== null) muestras[clave].push(valor);
      });
    }
    const promedio = (valores: number[]) =>
      valores.length
        ? Math.round(
            (valores.reduce((a, b) => a + b, 0) / valores.length) * 10,
          ) / 10
        : null;

    const casos = pedidos.map((pedido) => {
      const lista = porPedido.get(pedido.id) ?? [];
      const ultimo = lista.length ? lista[lista.length - 1] : undefined;
      const minutosEnEtapa = ultimo
        ? Math.max(
            0,
            Math.floor((ahora.getTime() - ultimo.ocurridoEn.getTime()) / 60000),
          )
        : Math.max(
            0,
            Math.floor((ahora.getTime() - pedido.creadoEn.getTime()) / 60000),
          );
      let etapa = 'Pedido creado';
      let objetivoMin: number | null = 5;
      let estacion: string | null = null;
      switch (ultimo?.tipo) {
        case TipoEventoOperacional.ENVIADO_ESTACION:
          etapa = 'Esperando inicio de preparación';
          objetivoMin = 5;
          break;
        case TipoEventoOperacional.PREPARACION_INICIADA: {
          etapa = 'En preparación';
          const meta = (
            ultimo.metadata as { metaPreparacionMin?: number } | null
          )?.metaPreparacionMin;
          objetivoMin = meta ?? 15;
          estacion =
            (ultimo.metadata as { estacion?: string } | null)?.estacion ?? null;
          break;
        }
        case TipoEventoOperacional.LISTO_ESTACION:
          etapa = 'Listo esperando retiro';
          objetivoMin = 5;
          estacion =
            (ultimo.metadata as { estacion?: string } | null)?.estacion ?? null;
          break;
        case TipoEventoOperacional.RETIRADO_ESTACION:
          etapa = 'Retirado esperando entrega';
          objetivoMin = 4;
          break;
        case TipoEventoOperacional.ENTREGADO_CLIENTE:
          etapa = 'En mesa';
          objetivoMin = null;
          break;
        case TipoEventoOperacional.CUENTA_SOLICITADA:
          etapa = 'Cuenta solicitada esperando pago';
          objetivoMin = 8;
          break;
        case TipoEventoOperacional.PAGO_COMPLETADO:
          etapa = 'Pagado';
          objetivoMin = null;
          break;
        case TipoEventoOperacional.PEDIDO_CREADO:
        default:
          etapa = 'Pedido creado esperando estación';
          objetivoMin = 5;
      }
      const riesgo =
        objetivoMin === null
          ? 'OK'
          : minutosEnEtapa > objetivoMin
            ? 'DEMORADO'
            : minutosEnEtapa >= Math.max(1, Math.floor(objetivoMin * 0.75))
              ? 'ATENCION'
              : 'OK';
      return {
        pedidoId: pedido.id,
        mesa: pedido.mesa ? `Mesa ${pedido.mesa.numero}` : pedido.tipo,
        estado: pedido.estado,
        etapa,
        estacion,
        minutosEnEtapa,
        objetivoMin,
        riesgo,
        ventaEstado: pedido.venta?.estado ?? null,
      };
    });

    const activos = casos.filter((item) => item.etapa !== 'Pagado');
    return {
      generadoEn: ahora,
      ventanaHoras: 24,
      resumen: {
        activos: activos.length,
        demorados: activos.filter((item) => item.riesgo === 'DEMORADO').length,
        listosSinRetirar: activos.filter(
          (item) => item.etapa === 'Listo esperando retiro',
        ).length,
        esperandoEntrega: activos.filter(
          (item) => item.etapa === 'Retirado esperando entrega',
        ).length,
        esperandoPago: activos.filter(
          (item) => item.etapa === 'Cuenta solicitada esperando pago',
        ).length,
      },
      tiemposPromedio: {
        pedidoACocina: promedio(muestras.pedidoACocina),
        cocinaAListo: promedio(muestras.cocinaAListo),
        listoARetirado: promedio(muestras.listoARetirado),
        retiradoAMesa: promedio(muestras.retiradoAMesa),
        entregaACuenta: promedio(muestras.entregaACuenta),
        cuentaAPago: promedio(muestras.cuentaAPago),
        cicloTotal: promedio(muestras.cicloTotal),
      },
      casos: activos.sort((a, b) => {
        const peso = (riesgo: string) =>
          riesgo === 'DEMORADO' ? 2 : riesgo === 'ATENCION' ? 1 : 0;
        return (
          peso(b.riesgo) - peso(a.riesgo) || b.minutosEnEtapa - a.minutosEnEtapa
        );
      }),
      nota: 'Los tiempos se calculan desde eventos operacionales persistidos. Los objetivos de preparación provienen de cada estación; retiro, entrega y pago usan umbrales operativos iniciales configurables en una fase posterior.',
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
