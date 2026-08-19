import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoVenta,
  EstrategiaInventario,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  FiltroReportesDto,
  FiltroTopProductosDto,
} from './dto/filtro-reportes.dto';

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual: UsuarioAutenticado,
  ) {
    return (
      usuarioActual.rol === 'SUPERADMIN' &&
      usuarioActual.restauranteId === null
    );
  }

  private filtroSucursal(
    usuarioActual: UsuarioAutenticado,
    sucursalId?: number,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      ...(sucursalId !== undefined
        ? { id: sucursalId }
        : {}),

      ...(!this.esSuperadmin(usuarioActual)
        ? {
            restauranteId:
              usuarioActual.restauranteId!,
          }
        : {}),

      ...(usuarioActual.sucursalId !== null
        ? {
            id: usuarioActual.sucursalId,
          }
        : {}),
    };
  }

  private async validarSucursalDentroDelAlcance(
    sucursalId: number | undefined,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (sucursalId === undefined) {
      return;
    }

    const sucursal =
      await this.prisma.sucursal.findFirst({
        where: this.filtroSucursal(
          usuarioActual,
          sucursalId,
        ),
        select: {
          id: true,
        },
      });

    if (!sucursal) {
      throw new NotFoundException(
        'Sucursal no encontrada',
      );
    }
  }

  private fechaDesdeTexto(
    valor: string,
    finDelDia: boolean,
  ) {
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);

    const fecha = soloFecha
      ? new Date(
          `${valor}T${
            finDelDia
              ? '23:59:59.999'
              : '00:00:00.000'
          }`,
        )
      : new Date(valor);

    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(
        'El rango de fechas no es válido',
      );
    }

    return fecha;
  }

  resolverRango(
    filtros: FiltroReportesDto,
  ) {
    const ahora = new Date();

    const inicio = filtros.desde
      ? this.fechaDesdeTexto(
          filtros.desde,
          false,
        )
      : new Date(
          ahora.getFullYear(),
          ahora.getMonth(),
          ahora.getDate(),
          0,
          0,
          0,
          0,
        );

    const fin = filtros.hasta
      ? this.fechaDesdeTexto(
          filtros.hasta,
          true,
        )
      : ahora;

    if (inicio > fin) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }

    const maximoDias = 366;
    const diferenciaMs =
      fin.getTime() - inicio.getTime();

    if (
      diferenciaMs >
      maximoDias * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        `El rango máximo permitido es de ${maximoDias} días`,
      );
    }

    return {
      inicio,
      fin,
    };
  }

  private filtroVenta(
    filtros: FiltroReportesDto,
    usuarioActual: UsuarioAutenticado,
    inicio: Date,
    fin: Date,
  ): Prisma.VentaWhereInput {
    return {
      fechaOperacion: {
        gte: inicio,
        lte: fin,
      },
      estado: {
        not: EstadoVenta.ANULADA,
      },
      sucursal: this.filtroSucursal(
        usuarioActual,
        filtros.sucursalId,
      ),
    };
  }

  async resumen(
    filtros: FiltroReportesDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(
      filtros.sucursalId,
      usuarioActual,
    );

    const { inicio, fin } =
      this.resolverRango(filtros);

    const where = this.filtroVenta(
      filtros,
      usuarioActual,
      inicio,
      fin,
    );

    const [agregado, porEstado, pagos] =
      await Promise.all([
        this.prisma.venta.aggregate({
          where,
          _count: {
            _all: true,
          },
          _sum: {
            total: true,
            descuentos: true,
            impuestos: true,
            impoconsumo: true,
            propina: true,
          },
        }),

        this.prisma.venta.groupBy({
          by: ['estado'],
          where,
          _count: {
            _all: true,
          },
          _sum: {
            total: true,
          },
        }),

        this.prisma.pago.aggregate({
          where: {
            venta: where,
          },
          _sum: {
            monto: true,
          },
        }),
      ]);

    return {
      periodo: {
        desde: inicio,
        hasta: fin,
      },
      cantidadVentas:
        agregado._count._all,
      totalVentas:
        agregado._sum.total?.toNumber() ?? 0,
      totalPagado:
        pagos._sum.monto?.toNumber() ?? 0,
      descuentos:
        agregado._sum.descuentos?.toNumber() ?? 0,
      impuestos:
        agregado._sum.impuestos?.toNumber() ?? 0,
      impoconsumo:
        agregado._sum.impoconsumo?.toNumber() ?? 0,
      propina:
        agregado._sum.propina?.toNumber() ?? 0,
      porEstado: porEstado.map(
        (item) => ({
          estado: item.estado,
          cantidad: item._count._all,
          total:
            item._sum.total?.toNumber() ?? 0,
        }),
      ),
    };
  }

  async ventasDiarias(
    filtros: FiltroReportesDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(
      filtros.sucursalId,
      usuarioActual,
    );

    const { inicio, fin } =
      this.resolverRango(filtros);

    const ventas =
      await this.prisma.venta.findMany({
        where: this.filtroVenta(
          filtros,
          usuarioActual,
          inicio,
          fin,
        ),
        select: {
          fechaOperacion: true,
          total: true,
        },
        orderBy: {
          fechaOperacion: 'asc',
        },
      });

    const porDia = new Map<
      string,
      {
        cantidad: number;
        total: Prisma.Decimal;
      }
    >();

    for (const venta of ventas) {
      const fecha = venta.fechaOperacion;
      const clave = [
        fecha.getFullYear(),
        String(fecha.getMonth() + 1).padStart(2, '0'),
        String(fecha.getDate()).padStart(2, '0'),
      ].join('-');

      const actual = porDia.get(clave) ?? {
        cantidad: 0,
        total: new Prisma.Decimal(0),
      };

      actual.cantidad += 1;
      actual.total = actual.total.plus(
        venta.total,
      );

      porDia.set(clave, actual);
    }

    return {
      periodo: {
        desde: inicio,
        hasta: fin,
      },
      datos: Array.from(
        porDia.entries(),
      ).map(([fecha, valor]) => ({
        fecha,
        cantidadVentas: valor.cantidad,
        totalVentas: valor.total.toNumber(),
      })),
    };
  }

  async productosMasVendidos(
    filtros: FiltroTopProductosDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(
      filtros.sucursalId,
      usuarioActual,
    );

    const { inicio, fin } =
      this.resolverRango(filtros);

    const limite = filtros.limite ?? 10;

    const agrupados =
      await this.prisma.detalleVenta.groupBy({
        by: ['productoId'],
        where: {
          venta: this.filtroVenta(
            filtros,
            usuarioActual,
            inicio,
            fin,
          ),
        },
        _sum: {
          cantidad: true,
          subtotal: true,
        },
        orderBy: {
          _sum: {
            cantidad: 'desc',
          },
        },
        take: limite,
      });

    const productos =
      await this.prisma.producto.findMany({
        where: {
          id: {
            in: agrupados.map(
              (item) => item.productoId,
            ),
          },
        },
        select: {
          id: true,
          nombre: true,
        },
      });

    const nombres = new Map(
      productos.map((producto) => [
        producto.id,
        producto.nombre,
      ]),
    );

    return {
      periodo: {
        desde: inicio,
        hasta: fin,
      },
      datos: agrupados.map(
        (item, indice) => ({
          posicion: indice + 1,
          productoId: item.productoId,
          producto:
            nombres.get(item.productoId) ??
            'Producto no disponible',
          cantidadVendida:
            item._sum.cantidad ?? 0,
          totalVendido:
            item._sum.subtotal?.toNumber() ?? 0,
        }),
      ),
    };
  }

  async metodosPago(
    filtros: FiltroReportesDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(
      filtros.sucursalId,
      usuarioActual,
    );

    const { inicio, fin } =
      this.resolverRango(filtros);

    const agrupados =
      await this.prisma.pago.groupBy({
        by: ['metodoPagoId'],
        where: {
          venta: this.filtroVenta(
            filtros,
            usuarioActual,
            inicio,
            fin,
          ),
        },
        _count: {
          _all: true,
        },
        _sum: {
          monto: true,
        },
        orderBy: {
          _sum: {
            monto: 'desc',
          },
        },
      });

    const metodos =
      await this.prisma.metodoPago.findMany({
        where: {
          id: {
            in: agrupados.map(
              (item) => item.metodoPagoId,
            ),
          },
        },
        select: {
          id: true,
          nombre: true,
          tipo: true,
        },
      });

    const metodosPorId = new Map(
      metodos.map((metodo) => [
        metodo.id,
        metodo,
      ]),
    );

    return {
      periodo: {
        desde: inicio,
        hasta: fin,
      },
      datos: agrupados.map((item) => {
        const metodo =
          metodosPorId.get(item.metodoPagoId);

        return {
          metodoPagoId: item.metodoPagoId,
          nombre:
            metodo?.nombre ??
            'Método no disponible',
          tipo: metodo?.tipo ?? null,
          cantidadPagos: item._count._all,
          total:
            item._sum.monto?.toNumber() ?? 0,
        };
      }),
    };
  }

  async inventarioSinStock(
    filtros: FiltroReportesDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(
      filtros.sucursalId,
      usuarioActual,
    );

    const sucursal = this.filtroSucursal(
      usuarioActual,
      filtros.sucursalId,
    );

    const [productos, articulos] =
      await Promise.all([
        this.prisma.producto.findMany({
          where: {
            estado: true,
            estrategiaInventario:
              EstrategiaInventario.STOCK_DIRECTO,
            stock: {
              lte: 0,
            },
            categoria: {
              estado: true,
              sucursal,
            },
          },
          select: {
            id: true,
            nombre: true,
            stock: true,
            unidadInventario: true,
            categoria: {
              select: {
                sucursalId: true,
                sucursal: {
                  select: {
                    nombre: true,
                  },
                },
              },
            },
          },
          orderBy: {
            stock: 'asc',
          },
        }),

        this.prisma.articulo.findMany({
          where: {
            estado: true,
            stock: {
              lte: 0,
            },
            sucursal,
          },
          select: {
            id: true,
            nombre: true,
            stock: true,
            unidad: true,
            sucursalId: true,
            sucursal: {
              select: {
                nombre: true,
              },
            },
          },
          orderBy: {
            stock: 'asc',
          },
        }),
      ]);

    return {
      total:
        productos.length + articulos.length,
      productos: productos.map(
        (producto) => ({
          id: producto.id,
          nombre: producto.nombre,
          sucursalId:
            producto.categoria.sucursalId,
          sucursal:
            producto.categoria.sucursal.nombre,
          stock: producto.stock,
          unidad: producto.unidadInventario,
        }),
      ),
      articulos: articulos.map(
        (articulo) => ({
          id: articulo.id,
          nombre: articulo.nombre,
          sucursalId: articulo.sucursalId,
          sucursal: articulo.sucursal.nombre,
          stock: articulo.stock,
          unidad: articulo.unidad,
        }),
      ),
      criterio:
        'Sin stock: existencias menores o iguales a cero. SIGR aún no modela stock mínimo.',
    };
  }
}
