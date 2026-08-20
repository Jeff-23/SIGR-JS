import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstrategiaInventario,
  MovimientoInventario,
  Prisma,
  TipoMovimientoInventario,
  UnidadInventario,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

import { AjustarInventarioDto } from './dto/ajustar-inventario.dto';
import { ListarExistenciasInventarioDto } from './dto/listar-existencias-inventario.dto';
import { ListarMovimientosInventarioDto } from './dto/listar-movimientos-inventario.dto';
import { convertirUnidad } from './inventario-unidades.util';

const TIPOS_MANUALES = new Set<TipoMovimientoInventario>([
  TipoMovimientoInventario.ENTRADA,
  TipoMovimientoInventario.AJUSTE_POSITIVO,
  TipoMovimientoInventario.AJUSTE_NEGATIVO,
  TipoMovimientoInventario.MERMA,
  TipoMovimientoInventario.DEVOLUCION,
  TipoMovimientoInventario.CONSUMO_INTERNO,
]);

const TIPOS_ENTRADA = new Set<TipoMovimientoInventario>([
  TipoMovimientoInventario.ENTRADA,
  TipoMovimientoInventario.AJUSTE_POSITIVO,
  TipoMovimientoInventario.DEVOLUCION,
]);

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private filtroSucursal(
    usuarioActual: UsuarioAutenticado,
    sucursalId?: number,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      ...(sucursalId !== undefined
        ? {
            id: sucursalId,
          }
        : {}),

      ...(!this.esSuperadmin(usuarioActual)
        ? {
            restauranteId: usuarioActual.restauranteId,
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
    sucursalId: number,
    usuarioActual: UsuarioAutenticado,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (
      usuarioActual.sucursalId !== null &&
      usuarioActual.sucursalId !== sucursalId
    ) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    const sucursal = await tx.sucursal.findFirst({
      where: this.filtroSucursal(usuarioActual, sucursalId),
      select: {
        id: true,
        restauranteId: true,
      },
    });

    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    return sucursal;
  }

  async existencias(
    filtros: ListarExistenciasInventarioDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (filtros.sucursalId !== undefined) {
      await this.validarSucursalDentroDelAlcance(
        filtros.sucursalId,
        usuarioActual,
      );
    }

    const filtroSucursal = this.filtroSucursal(
      usuarioActual,
      filtros.sucursalId,
    );

    const [productos, articulos] = await Promise.all([
      this.prisma.producto.findMany({
        where: {
          estado: true,
          categoria: {
            estado: true,
            sucursal: filtroSucursal,
          },
        },
        select: {
          id: true,
          nombre: true,
          estrategiaInventario: true,
          unidadInventario: true,
          stock: true,
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
          id: 'asc',
        },
      }),

      this.prisma.articulo.findMany({
        where: {
          estado: true,
          sucursal: filtroSucursal,
        },
        select: {
          id: true,
          nombre: true,
          unidad: true,
          stock: true,
          costoUnidad: true,
          sucursalId: true,
          sucursal: {
            select: {
              nombre: true,
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      }),
    ]);

    return {
      productos: productos.map((producto) => ({
        id: producto.id,
        nombre: producto.nombre,
        sucursalId: producto.categoria.sucursalId,
        sucursal: producto.categoria.sucursal.nombre,
        estrategiaInventario: producto.estrategiaInventario,
        unidad: producto.unidadInventario,
        stock: producto.stock,
      })),

      articulos: articulos.map((articulo) => ({
        id: articulo.id,
        nombre: articulo.nombre,
        sucursalId: articulo.sucursalId,
        sucursal: articulo.sucursal.nombre,
        unidad: articulo.unidad,
        stock: articulo.stock,
        costoUnidad: articulo.costoUnidad,
      })),
    };
  }

  async movimientos(
    filtros: ListarMovimientosInventarioDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (filtros.sucursalId !== undefined) {
      await this.validarSucursalDentroDelAlcance(
        filtros.sucursalId,
        usuarioActual,
      );
    }

    if (filtros.productoId !== undefined && filtros.articuloId !== undefined) {
      throw new BadRequestException(
        'Filtre por producto o por artículo, no por ambos',
      );
    }

    return this.prisma.movimientoInventario.findMany({
      where: {
        sucursal: this.filtroSucursal(usuarioActual, filtros.sucursalId),

        ...(filtros.productoId !== undefined
          ? {
              productoId: filtros.productoId,
            }
          : {}),

        ...(filtros.articuloId !== undefined
          ? {
              articuloId: filtros.articuloId,
            }
          : {}),

        ...(filtros.tipo !== undefined
          ? {
              tipo: filtros.tipo,
            }
          : {}),

        ...(filtros.desde || filtros.hasta
          ? {
              creadoEn: {
                ...(filtros.desde
                  ? {
                      gte: new Date(filtros.desde),
                    }
                  : {}),

                ...(filtros.hasta
                  ? {
                      lte: new Date(filtros.hasta),
                    }
                  : {}),
              },
            }
          : {}),
      },

      include: {
        producto: {
          select: {
            id: true,
            nombre: true,
          },
        },

        articulo: {
          select: {
            id: true,
            nombre: true,
          },
        },

        usuario: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            email: true,
          },
        },
      },

      orderBy: [
        {
          creadoEn: 'desc',
        },
        {
          id: 'desc',
        },
      ],
    });
  }

  async ajustar(data: AjustarInventarioDto, usuarioActual: UsuarioAutenticado) {
    if (
      (data.productoId === undefined && data.articuloId === undefined) ||
      (data.productoId !== undefined && data.articuloId !== undefined)
    ) {
      throw new BadRequestException(
        'Debe indicar exactamente un producto o un artículo',
      );
    }

    if (!TIPOS_MANUALES.has(data.tipo)) {
      throw new BadRequestException(
        'El tipo de movimiento indicado no puede registrarse manualmente',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await this.validarSucursalDentroDelAlcance(
          data.sucursalId,
          usuarioActual,
          tx,
        );

        if (data.productoId !== undefined) {
          return this.ajustarProducto(tx, data, usuarioActual);
        }

        return this.ajustarArticulo(tx, data, usuarioActual);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async ajustarProducto(
    tx: Prisma.TransactionClient,
    data: AjustarInventarioDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const producto = await tx.producto.findFirst({
      where: {
        id: data.productoId,
        estado: true,

        categoria: {
          estado: true,
          sucursalId: data.sucursalId,
          sucursal: this.filtroSucursal(usuarioActual, data.sucursalId),
        },
      },

      select: {
        id: true,
        nombre: true,
        stock: true,
        unidadInventario: true,
        estrategiaInventario: true,
      },
    });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (producto.estrategiaInventario !== EstrategiaInventario.STOCK_DIRECTO) {
      throw new BadRequestException(
        `El producto "${producto.nombre}" no utiliza STOCK_DIRECTO`,
      );
    }

    const cantidad = this.cantidadBase(
      data.cantidad,
      data.unidad,
      producto.unidadInventario,
    );

    const stockAnterior = producto.stock;

    const entrada = TIPOS_ENTRADA.has(data.tipo);

    const actualizado = await tx.producto.updateMany({
      where: {
        id: producto.id,

        ...(entrada
          ? {}
          : {
              stock: {
                gte: cantidad,
              },
            }),
      },

      data: {
        stock: entrada
          ? {
              increment: cantidad,
            }
          : {
              decrement: cantidad,
            },
      },
    });

    if (actualizado.count !== 1) {
      throw new BadRequestException(
        `Stock insuficiente de "${producto.nombre}"`,
      );
    }

    const productoActualizado = await tx.producto.findUniqueOrThrow({
      where: {
        id: producto.id,
      },
      select: {
        stock: true,
      },
    });

    return tx.movimientoInventario.create({
      data: {
        tipo: data.tipo,
        cantidad,
        unidad: producto.unidadInventario,
        stockAnterior,
        stockNuevo: productoActualizado.stock,
        motivo: data.motivo,
        sucursalId: data.sucursalId,
        usuarioId: usuarioActual.id,
        productoId: producto.id,
      },
    });
  }

  private async ajustarArticulo(
    tx: Prisma.TransactionClient,
    data: AjustarInventarioDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const articulo = await tx.articulo.findFirst({
      where: {
        id: data.articuloId,
        estado: true,
        sucursalId: data.sucursalId,

        sucursal: this.filtroSucursal(usuarioActual, data.sucursalId),
      },

      select: {
        id: true,
        nombre: true,
        unidad: true,
        stock: true,
      },
    });

    if (!articulo) {
      throw new NotFoundException('Artículo no encontrado');
    }

    const cantidad = this.cantidadBase(
      data.cantidad,
      data.unidad,
      articulo.unidad,
    );

    const stockAnterior = articulo.stock;

    const entrada = TIPOS_ENTRADA.has(data.tipo);

    const actualizado = await tx.articulo.updateMany({
      where: {
        id: articulo.id,

        ...(entrada
          ? {}
          : {
              stock: {
                gte: cantidad,
              },
            }),
      },

      data: {
        stock: entrada
          ? {
              increment: cantidad,
            }
          : {
              decrement: cantidad,
            },
      },
    });

    if (actualizado.count !== 1) {
      throw new BadRequestException(
        `Stock insuficiente de "${articulo.nombre}"`,
      );
    }

    const articuloActualizado = await tx.articulo.findUniqueOrThrow({
      where: {
        id: articulo.id,
      },
      select: {
        stock: true,
      },
    });

    return tx.movimientoInventario.create({
      data: {
        tipo: data.tipo,
        cantidad,
        unidad: articulo.unidad,
        stockAnterior,
        stockNuevo: articuloActualizado.stock,
        motivo: data.motivo,
        sucursalId: data.sucursalId,
        usuarioId: usuarioActual.id,
        articuloId: articulo.id,
      },
    });
  }

  /**
   * Aplica el consumo de inventario asociado a una Venta dentro
   * de la MISMA transacción que crea dicha Venta.
   *
   * Reglas:
   * - NO_CONTROLAR: no modifica existencias.
   * - STOCK_DIRECTO: descuenta del stock del Producto.
   * - POR_RECETA: descuenta de los Articulos de la receta.
   * - Un ingrediente repetido entre varios productos se agrega
   *   antes de descontar para dejar un movimiento único por
   *   artículo y venta.
   * - Cualquier stock insuficiente lanza excepción y revierte
   *   toda la transacción, incluida la creación de la Venta.
   */
  async descontarPorVenta(
    tx: Prisma.TransactionClient,
    params: {
      ventaId: number;
      sucursalId: number;
      usuarioActual: UsuarioAutenticado;
      detalles: Array<{
        productoId: number;
        cantidad: number;
      }>;
    },
  ) {
    const cantidadesPorProducto = new Map<number, Prisma.Decimal>();

    for (const detalle of params.detalles) {
      const cantidad = new Prisma.Decimal(detalle.cantidad);

      if (cantidad.lte(0)) {
        throw new BadRequestException(
          'La cantidad vendida debe ser mayor que cero',
        );
      }

      cantidadesPorProducto.set(
        detalle.productoId,
        (
          cantidadesPorProducto.get(detalle.productoId) ?? new Prisma.Decimal(0)
        ).plus(cantidad),
      );
    }

    const idsProductos = [...cantidadesPorProducto.keys()];

    if (idsProductos.length === 0) {
      return [];
    }

    const productos = await tx.producto.findMany({
      where: {
        id: {
          in: idsProductos,
        },
        estado: true,
        categoria: {
          estado: true,
          sucursalId: params.sucursalId,
        },
      },
      select: {
        id: true,
        nombre: true,
        estrategiaInventario: true,
        unidadInventario: true,
        stock: true,
        recetas: {
          select: {
            cantidad: true,
            unidad: true,
            articulo: {
              select: {
                id: true,
                nombre: true,
                unidad: true,
                stock: true,
                estado: true,
                sucursalId: true,
              },
            },
          },
        },
      },
    });

    if (productos.length !== idsProductos.length) {
      throw new NotFoundException(
        'Uno o más productos de la venta no existen o no pertenecen a la sucursal',
      );
    }

    const usaInventario = productos.some(
      (producto) =>
        producto.estrategiaInventario !== EstrategiaInventario.NO_CONTROLAR,
    );

    const usaRecetas = productos.some(
      (producto) =>
        producto.estrategiaInventario === EstrategiaInventario.POR_RECETA,
    );

    if (
      !this.esSuperadmin(params.usuarioActual) &&
      usaInventario &&
      !params.usuarioActual.capacidades.includes('INVENTARIO')
    ) {
      throw new ForbiddenException(
        'El control de inventario no está incluido en el plan del restaurante',
      );
    }

    if (
      !this.esSuperadmin(params.usuarioActual) &&
      usaRecetas &&
      !params.usuarioActual.capacidades.includes('RECETAS')
    ) {
      throw new ForbiddenException(
        'El control por receta no está incluido en el plan del restaurante',
      );
    }

    const movimientos: MovimientoInventario[] = [];

    // STOCK_DIRECTO: cada Producto conserva su propio stock.
    for (const producto of productos) {
      if (
        producto.estrategiaInventario !== EstrategiaInventario.STOCK_DIRECTO
      ) {
        continue;
      }

      const cantidad = cantidadesPorProducto.get(producto.id);

      const stockAnterior = producto.stock;

      const actualizado = await tx.producto.updateMany({
        where: {
          id: producto.id,
          stock: {
            gte: cantidad,
          },
        },
        data: {
          stock: {
            decrement: cantidad,
          },
        },
      });

      if (actualizado.count !== 1) {
        throw new BadRequestException(
          `Stock insuficiente de "${producto.nombre}"`,
        );
      }

      const stockNuevo = stockAnterior.minus(cantidad);

      movimientos.push(
        await tx.movimientoInventario.create({
          data: {
            tipo: TipoMovimientoInventario.SALIDA_VENTA,
            cantidad,
            unidad: producto.unidadInventario,
            stockAnterior,
            stockNuevo,
            motivo: `Venta #${params.ventaId} - STOCK_DIRECTO`,
            sucursalId: params.sucursalId,
            usuarioId: params.usuarioActual.id,
            ventaId: params.ventaId,
            productoId: producto.id,
          },
        }),
      );
    }

    // POR_RECETA: agregamos consumo por Articulo para evitar
    // descuentos fragmentados si varias recetas usan el mismo.
    const consumoPorArticulo = new Map<
      number,
      {
        id: number;
        nombre: string;
        unidad: UnidadInventario;
        stock: Prisma.Decimal;
        cantidad: Prisma.Decimal;
      }
    >();

    for (const producto of productos) {
      if (producto.estrategiaInventario !== EstrategiaInventario.POR_RECETA) {
        continue;
      }

      if (producto.recetas.length === 0) {
        throw new BadRequestException(
          `El producto "${producto.nombre}" usa POR_RECETA pero no tiene receta configurada`,
        );
      }

      const cantidadVendida = cantidadesPorProducto.get(producto.id);

      for (const receta of producto.recetas) {
        const articulo = receta.articulo;

        if (!articulo.estado || articulo.sucursalId !== params.sucursalId) {
          throw new BadRequestException(
            `La receta de "${producto.nombre}" contiene un artículo inactivo o ajeno a la sucursal`,
          );
        }

        const consumoPorUnidad = convertirUnidad(
          receta.cantidad,
          receta.unidad,
          articulo.unidad,
        );

        const consumoTotal = consumoPorUnidad
          .mul(cantidadVendida)
          .toDecimalPlaces(4);

        if (consumoTotal.lt(new Prisma.Decimal('0.0001'))) {
          throw new BadRequestException(
            `El consumo calculado para "${articulo.nombre}" es menor a la precisión mínima del inventario`,
          );
        }

        const acumulado = consumoPorArticulo.get(articulo.id);

        if (acumulado) {
          acumulado.cantidad = acumulado.cantidad.plus(consumoTotal);
        } else {
          consumoPorArticulo.set(articulo.id, {
            id: articulo.id,
            nombre: articulo.nombre,
            unidad: articulo.unidad,
            stock: articulo.stock,
            cantidad: consumoTotal,
          });
        }
      }
    }

    for (const consumo of consumoPorArticulo.values()) {
      const actualizado = await tx.articulo.updateMany({
        where: {
          id: consumo.id,
          estado: true,
          sucursalId: params.sucursalId,
          stock: {
            gte: consumo.cantidad,
          },
        },
        data: {
          stock: {
            decrement: consumo.cantidad,
          },
        },
      });

      if (actualizado.count !== 1) {
        throw new BadRequestException(
          `Stock insuficiente de "${consumo.nombre}"`,
        );
      }

      const stockNuevo = consumo.stock.minus(consumo.cantidad);

      movimientos.push(
        await tx.movimientoInventario.create({
          data: {
            tipo: TipoMovimientoInventario.SALIDA_VENTA,
            cantidad: consumo.cantidad,
            unidad: consumo.unidad,
            stockAnterior: consumo.stock,
            stockNuevo,
            motivo: `Venta #${params.ventaId} - POR_RECETA`,
            sucursalId: params.sucursalId,
            usuarioId: params.usuarioActual.id,
            ventaId: params.ventaId,
            articuloId: consumo.id,
          },
        }),
      );
    }

    return movimientos;
  }

  /**
   * Revierte la afectación de inventario de una Venta anulable.
   *
   * Reglas:
   * - Nunca elimina ni modifica los SALIDA_VENTA originales.
   * - Crea un REVERSO_VENTA por cada movimiento original.
   * - movimientoOrigenId enlaza la compensación con su origen.
   * - Restaura sobre el stock ACTUAL del recurso.
   * - Si la unidad cambió desde la venta, convierte únicamente
   *   cuando las unidades siguen siendo compatibles.
   * - Si ya existe cualquier reverso para la Venta, aborta para
   *   impedir restauraciones duplicadas o parciales.
   *
   * Debe ejecutarse dentro de la MISMA transacción Serializable
   * que cambia la Venta a ANULADA.
   */
  async revertirPorAnulacionVenta(
    tx: Prisma.TransactionClient,
    params: {
      ventaId: number;
      sucursalId: number;
      usuarioActual: UsuarioAutenticado;
    },
  ) {
    const movimientosOriginales = await tx.movimientoInventario.findMany({
      where: {
        ventaId: params.ventaId,
        sucursalId: params.sucursalId,
        tipo: TipoMovimientoInventario.SALIDA_VENTA,
      },
      select: {
        id: true,
        cantidad: true,
        unidad: true,
        productoId: true,
        articuloId: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    if (movimientosOriginales.length === 0) {
      return [];
    }

    const idsOriginales = movimientosOriginales.map(
      (movimiento) => movimiento.id,
    );

    const reversosExistentes = await tx.movimientoInventario.count({
      where: {
        OR: [
          {
            movimientoOrigenId: {
              in: idsOriginales,
            },
          },
          {
            ventaId: params.ventaId,
            tipo: TipoMovimientoInventario.REVERSO_VENTA,
          },
        ],
      },
    });

    if (reversosExistentes > 0) {
      throw new BadRequestException(
        'El inventario de esta venta ya fue revertido total o parcialmente',
      );
    }

    const reversos: MovimientoInventario[] = [];

    for (const movimiento of movimientosOriginales) {
      if (movimiento.productoId !== null) {
        const producto = await tx.producto.findFirst({
          where: {
            id: movimiento.productoId,
            categoria: {
              sucursalId: params.sucursalId,
            },
          },
          select: {
            id: true,
            nombre: true,
            stock: true,
            unidadInventario: true,
          },
        });

        if (!producto) {
          throw new BadRequestException(
            `No es posible restaurar el producto asociado al movimiento #${movimiento.id}`,
          );
        }

        const cantidadRestaurar = convertirUnidad(
          movimiento.cantidad,
          movimiento.unidad,
          producto.unidadInventario,
        ).toDecimalPlaces(4);

        if (cantidadRestaurar.lt(new Prisma.Decimal('0.0001'))) {
          throw new BadRequestException(
            `La reversión del producto "${producto.nombre}" es menor a la precisión mínima del inventario`,
          );
        }

        const stockAnterior = producto.stock;

        const productoActualizado = await tx.producto.update({
          where: {
            id: producto.id,
          },
          data: {
            stock: {
              increment: cantidadRestaurar,
            },
          },
          select: {
            stock: true,
          },
        });

        reversos.push(
          await tx.movimientoInventario.create({
            data: {
              tipo: TipoMovimientoInventario.REVERSO_VENTA,
              cantidad: cantidadRestaurar,
              unidad: producto.unidadInventario,
              stockAnterior,
              stockNuevo: productoActualizado.stock,
              motivo: `Anulación Venta #${params.ventaId} - reverso de movimiento #${movimiento.id}`,
              sucursalId: params.sucursalId,
              usuarioId: params.usuarioActual.id,
              ventaId: params.ventaId,
              productoId: producto.id,
              movimientoOrigenId: movimiento.id,
            },
          }),
        );

        continue;
      }

      if (movimiento.articuloId !== null) {
        const articulo = await tx.articulo.findFirst({
          where: {
            id: movimiento.articuloId,
            sucursalId: params.sucursalId,
          },
          select: {
            id: true,
            nombre: true,
            stock: true,
            unidad: true,
          },
        });

        if (!articulo) {
          throw new BadRequestException(
            `No es posible restaurar el artículo asociado al movimiento #${movimiento.id}`,
          );
        }

        const cantidadRestaurar = convertirUnidad(
          movimiento.cantidad,
          movimiento.unidad,
          articulo.unidad,
        ).toDecimalPlaces(4);

        if (cantidadRestaurar.lt(new Prisma.Decimal('0.0001'))) {
          throw new BadRequestException(
            `La reversión del artículo "${articulo.nombre}" es menor a la precisión mínima del inventario`,
          );
        }

        const stockAnterior = articulo.stock;

        const articuloActualizado = await tx.articulo.update({
          where: {
            id: articulo.id,
          },
          data: {
            stock: {
              increment: cantidadRestaurar,
            },
          },
          select: {
            stock: true,
          },
        });

        reversos.push(
          await tx.movimientoInventario.create({
            data: {
              tipo: TipoMovimientoInventario.REVERSO_VENTA,
              cantidad: cantidadRestaurar,
              unidad: articulo.unidad,
              stockAnterior,
              stockNuevo: articuloActualizado.stock,
              motivo: `Anulación Venta #${params.ventaId} - reverso de movimiento #${movimiento.id}`,
              sucursalId: params.sucursalId,
              usuarioId: params.usuarioActual.id,
              ventaId: params.ventaId,
              articuloId: articulo.id,
              movimientoOrigenId: movimiento.id,
            },
          }),
        );

        continue;
      }

      throw new BadRequestException(
        `El movimiento de inventario #${movimiento.id} no tiene un recurso asociado`,
      );
    }

    return reversos;
  }

  private cantidadBase(
    cantidad: number,
    unidadOrigen: AjustarInventarioDto['unidad'],
    unidadDestino: AjustarInventarioDto['unidad'],
  ) {
    const convertida = convertirUnidad(
      cantidad,
      unidadOrigen,
      unidadDestino,
    ).toDecimalPlaces(4);

    if (convertida.lt(new Prisma.Decimal('0.0001'))) {
      throw new BadRequestException(
        'La cantidad convertida es menor a la precisión mínima del inventario',
      );
    }

    return convertida;
  }
}
