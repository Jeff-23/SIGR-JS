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

  async centroOperativo(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursal(sucursalId, usuario);
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const base = await this.operacionEnVivo(sucursalId, usuario);
    const [configuracion, pedidos] = await Promise.all([
      this.prisma.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: {
            sucursalId,
            clave: 'CENTRO_OPERATIVO_UMBRALES',
          },
        },
      }),
      this.prisma.pedido.findMany({
        where: {
          sucursalId,
          creadoEn: { gte: desde },
          estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.FACTURADO] },
        },
        include: {
          mesa: { select: { id: true, numero: true, situacion: true } },
          mesero: { select: { id: true, nombres: true, apellidos: true } },
          venta: { select: { id: true, estado: true, total: true } },
          comandas: {
            include: {
              estacion: { select: { id: true, codigo: true, nombre: true } },
              detalles: { select: { cantidad: true, estado: true } },
            },
            orderBy: { fechaEnvio: 'asc' },
          },
          eventosOperacionales: {
            where: { ocurridoEn: { gte: desde } },
            orderBy: { ocurridoEn: 'asc' },
          },
        },
        orderBy: { creadoEn: 'asc' },
        take: 200,
      }),
    ]);

    const cfg = (configuracion?.valor ?? {}) as {
      esperaEstacionMin?: number;
      retiroMin?: number;
      entregaMin?: number;
      cuentaMin?: number;
      pagoMin?: number;
      criticoMultiplicador?: number;
    };
    const umbrales = {
      esperaEstacionMin: cfg.esperaEstacionMin ?? 5,
      retiroMin: cfg.retiroMin ?? 5,
      entregaMin: cfg.entregaMin ?? 4,
      cuentaMin: cfg.cuentaMin ?? 20,
      pagoMin: cfg.pagoMin ?? 8,
      criticoMultiplicador: cfg.criticoMultiplicador ?? 1.5,
    };

    const prioridad = (minutos: number, objetivo: number | null) => {
      if (!objetivo || objetivo <= 0) return 'NORMAL' as const;
      if (
        minutos >=
        Math.max(objetivo * umbrales.criticoMultiplicador, objetivo + 10)
      )
        return 'CRITICO' as const;
      if (minutos > objetivo) return 'URGENTE' as const;
      if (minutos >= Math.max(1, Math.floor(objetivo * 0.75)))
        return 'ATENCION' as const;
      return 'NORMAL' as const;
    };
    const minutosDesde = (fecha: Date) =>
      Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 60000));
    const etiquetas: Record<TipoEventoOperacional, string> = {
      PEDIDO_CREADO: 'Pedido tomado',
      ENVIADO_ESTACION: 'Enviado a estación',
      PREPARACION_INICIADA: 'Preparación iniciada',
      LISTO_ESTACION: 'Estación lista',
      RETIRADO_ESTACION: 'Retirado para servicio',
      ENTREGADO_CLIENTE: 'Entregado',
      CUENTA_SOLICITADA: 'Cuenta solicitada',
      PAGO_COMPLETADO: 'Pago completado',
    };

    const casos = pedidos
      .map((pedido) => {
        const eventos = pedido.eventosOperacionales;
        const ultimo = eventos.length ? eventos[eventos.length - 1] : undefined;
        const minutos = minutosDesde(ultimo?.ocurridoEn ?? pedido.creadoEn);
        const metaPreparacion = pedido.comandas.length
          ? Math.max(...pedido.comandas.map((item) => item.metaPreparacionMin))
          : 15;
        let etapa = 'Pedido creado esperando estación';
        let area: 'COCINA' | 'BAR' | 'SALON' | 'CAJA' = 'SALON';
        let objetivoMin: number | null = umbrales.esperaEstacionMin;
        let accion: 'COCINA' | 'BAR' | 'SALON' | 'CAJA' = 'SALON';
        let estacion: string | null = null;
        switch (ultimo?.tipo) {
          case TipoEventoOperacional.ENVIADO_ESTACION:
            etapa = 'Esperando inicio de preparación';
            objetivoMin = umbrales.esperaEstacionMin;
            area = (
              (ultimo.metadata as { estacion?: string } | null)?.estacion ?? ''
            )
              .toUpperCase()
              .includes('BAR')
              ? 'BAR'
              : 'COCINA';
            accion = area;
            break;
          case TipoEventoOperacional.PREPARACION_INICIADA:
            etapa = 'Pedido en preparación';
            objetivoMin =
              (ultimo.metadata as { metaPreparacionMin?: number } | null)
                ?.metaPreparacionMin ?? metaPreparacion;
            estacion =
              (ultimo.metadata as { estacion?: string } | null)?.estacion ??
              null;
            area = estacion?.toUpperCase().includes('BAR') ? 'BAR' : 'COCINA';
            accion = area;
            break;
          case TipoEventoOperacional.LISTO_ESTACION:
            etapa = 'Comida o bebida lista sin retirar';
            objetivoMin = umbrales.retiroMin;
            estacion =
              (ultimo.metadata as { estacion?: string } | null)?.estacion ??
              null;
            area = estacion?.toUpperCase().includes('BAR') ? 'BAR' : 'COCINA';
            accion = area;
            break;
          case TipoEventoOperacional.RETIRADO_ESTACION:
            etapa = 'Retirado esperando entrega';
            objetivoMin = umbrales.entregaMin;
            area = 'SALON';
            accion = 'SALON';
            break;
          case TipoEventoOperacional.ENTREGADO_CLIENTE:
            etapa = 'Mesa atendida';
            objetivoMin = umbrales.cuentaMin;
            area = 'SALON';
            accion = 'SALON';
            break;
          case TipoEventoOperacional.CUENTA_SOLICITADA:
            etapa = 'Cuenta solicitada esperando pago';
            objetivoMin = umbrales.pagoMin;
            area = 'CAJA';
            accion = 'CAJA';
            break;
          case TipoEventoOperacional.PAGO_COMPLETADO:
            etapa = 'Pagado';
            objetivoMin = null;
            area = 'CAJA';
            accion = 'CAJA';
            break;
          case TipoEventoOperacional.PEDIDO_CREADO:
          default:
            break;
        }

        const cocina = pedido.comandas.filter((item) =>
          item.estacion.codigo.toUpperCase().includes('COCINA'),
        );
        const bar = pedido.comandas.filter((item) =>
          item.estacion.codigo.toUpperCase().includes('BAR'),
        );
        const linea = (items: typeof pedido.comandas) => ({
          total: items.reduce(
            (sum, item) =>
              sum + item.detalles.reduce((n, d) => n + d.cantidad, 0),
            0,
          ),
          listas: items.reduce(
            (sum, item) =>
              sum +
              item.detalles
                .filter((d) =>
                  ['LISTA', 'ENTREGADA'].includes(String(d.estado)),
                )
                .reduce((n, d) => n + d.cantidad, 0),
            0,
          ),
        });
        const cocinaLineas = linea(cocina);
        const barLineas = linea(bar);
        const totalLineas = cocinaLineas.total + barLineas.total;
        const listas = cocinaLineas.listas + barLineas.listas;
        const parcial = totalLineas > 0 && listas > 0 && listas < totalLineas;
        if (parcial && etapa === 'Pedido en preparación')
          etapa = 'Pedido parcialmente listo';

        const nivel = prioridad(minutos, objetivoMin);
        return {
          pedidoId: pedido.id,
          mesaId: pedido.mesa?.id ?? null,
          mesa: pedido.mesa ? `Mesa ${pedido.mesa.numero}` : pedido.tipo,
          mesero: pedido.mesero
            ? `${pedido.mesero.nombres} ${pedido.mesero.apellidos}`.trim()
            : null,
          total: pedido.venta?.total ?? pedido.total,
          estado: pedido.estado,
          etapa,
          area,
          estacion,
          minutosEnEtapa: minutos,
          objetivoMin,
          retrasoMin: objetivoMin ? Math.max(0, minutos - objetivoMin) : 0,
          prioridad: nivel,
          accion,
          progreso: {
            cocina: cocinaLineas,
            bar: barLineas,
            listas,
            total: totalLineas,
            parcial,
          },
          timeline: eventos.map((evento) => ({
            tipo: evento.tipo,
            etiqueta: etiquetas[evento.tipo],
            ocurridoEn: evento.ocurridoEn,
            metadata: evento.metadata,
          })),
        };
      })
      .filter((item) => item.etapa !== 'Pagado');

    const estacionesMap = new Map<
      string,
      {
        codigo: string;
        nombre: string;
        pendientes: number;
        preparando: number;
        listas: number;
        retrasadas: number;
        tiempos: number[];
      }
    >();
    pedidos.forEach((pedido) =>
      pedido.comandas.forEach((comanda) => {
        const key = comanda.estacion.codigo;
        const item = estacionesMap.get(key) ?? {
          codigo: key,
          nombre: comanda.estacion.nombre,
          pendientes: 0,
          preparando: 0,
          listas: 0,
          retrasadas: 0,
          tiempos: [],
        };
        const estado = String(comanda.estado);
        if (estado === 'PENDIENTE') item.pendientes += 1;
        if (estado === 'EN_PREPARACION') item.preparando += 1;
        if (estado === 'LISTA') item.listas += 1;
        if (estado === 'PENDIENTE' || estado === 'EN_PREPARACION') {
          const minutos = minutosDesde(
            comanda.fechaInicio ?? comanda.fechaEnvio,
          );
          item.tiempos.push(minutos);
          if (minutos > comanda.metaPreparacionMin) item.retrasadas += 1;
        }
        estacionesMap.set(key, item);
      }),
    );
    const estaciones = [...estacionesMap.values()].map((item) => ({
      codigo: item.codigo,
      nombre: item.nombre,
      pendientes: item.pendientes,
      preparando: item.preparando,
      listas: item.listas,
      retrasadas: item.retrasadas,
      tiempoPromedioActual: item.tiempos.length
        ? Math.round(
            item.tiempos.reduce((a, b) => a + b, 0) / item.tiempos.length,
          )
        : 0,
    }));

    const peso = (nivel: string) =>
      nivel === 'CRITICO'
        ? 3
        : nivel === 'URGENTE'
          ? 2
          : nivel === 'ATENCION'
            ? 1
            : 0;
    const cola = [...casos].sort(
      (a, b) =>
        peso(b.prioridad) - peso(a.prioridad) ||
        b.retrasoMin - a.retrasoMin ||
        b.minutosEnEtapa - a.minutosEnEtapa,
    );
    const mesasOcupadas = new Set(
      casos
        .map((item) => item.mesaId)
        .filter((id): id is number => id !== null),
    ).size;
    const atencion = cola.filter((item) => item.prioridad !== 'NORMAL').length;
    const tiemposActivos = cola.map((item) => item.minutosEnEtapa);
    const totalPendientesEstacion = estaciones.reduce(
      (sum, item) => sum + item.pendientes + item.preparando,
      0,
    );
    const alertasRegla: {
      nivel: 'URGENTE' | 'CRITICO';
      area: string;
      mensaje: string;
    }[] = [];
    estaciones.forEach((item) => {
      const concentracion = totalPendientesEstacion
        ? (item.pendientes + item.preparando) / totalPendientesEstacion
        : 0;
      if (item.retrasadas >= 3) {
        alertasRegla.push({
          nivel: 'CRITICO',
          area: item.codigo,
          mensaje: `${item.nombre} acumula ${item.retrasadas} comandas retrasadas.`,
        });
      } else if (concentracion >= 0.7 && totalPendientesEstacion >= 4) {
        alertasRegla.push({
          nivel: 'URGENTE',
          area: item.codigo,
          mensaje: `${item.nombre} concentra ${Math.round(concentracion * 100)} % de las comandas pendientes actuales.`,
        });
      }
    });

    return {
      generadoEn: ahora,
      actualizacionSegundos: 15,
      umbrales,
      resumen: {
        mesasOcupadas,
        mesasEsperandoAtencion: atencion,
        pedidosEnPreparacion: casos.filter(
          (item) =>
            item.etapa === 'Pedido en preparación' ||
            item.etapa === 'Pedido parcialmente listo',
        ).length,
        pedidosRetrasados: casos.filter((item) =>
          ['URGENTE', 'CRITICO'].includes(item.prioridad),
        ).length,
        listosSinRetirar: casos.filter(
          (item) => item.etapa === 'Comida o bebida lista sin retirar',
        ).length,
        cuentasSolicitadas: casos.filter(
          (item) => item.etapa === 'Cuenta solicitada esperando pago',
        ).length,
        pendientesPago: casos.filter((item) => item.area === 'CAJA').length,
        tiempoPromedioOperativoActual: tiemposActivos.length
          ? Math.round(
              (tiemposActivos.reduce((a, b) => a + b, 0) /
                tiemposActivos.length) *
                10,
            ) / 10
          : 0,
        situacionesAtencion: atencion + alertasRegla.length,
      },
      cola,
      estaciones,
      alertasRegla,
      tiemposPromedio24h: base.tiemposPromedio,
      nota: 'Centro Operativo usa eventos persistidos, estado de comandas, mesas y ventas de la sucursal. Los umbrales pueden definirse con la configuración CENTRO_OPERATIVO_UMBRALES; si no existe se aplican valores seguros por defecto.',
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
