import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstrategiaInventario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { imagenProductoDb } from './imagenes-producto.prisma';
import { SyncBusinessService } from '../sync/sync-business.service';

@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncBusiness: SyncBusinessService,
  ) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private validarCapacidadesInventario(
    estrategia: EstrategiaInventario | undefined,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (
      estrategia === undefined ||
      estrategia === EstrategiaInventario.NO_CONTROLAR ||
      this.esSuperadmin(usuarioActual)
    ) {
      return;
    }

    if (!usuarioActual.capacidades.includes('INVENTARIO')) {
      throw new ForbiddenException(
        'El control de inventario no está incluido en el plan del restaurante',
      );
    }

    if (
      estrategia === EstrategiaInventario.POR_RECETA &&
      !usuarioActual.capacidades.includes('RECETAS')
    ) {
      throw new ForbiddenException(
        'El control por receta no está incluido en el plan del restaurante',
      );
    }
  }

  private async validarCategoriaDentroDelAlcance(
    categoriaId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const categoria = await this.prisma.categoria.findFirst({
      where: {
        id: categoriaId,
        estado: true,

        sucursal: {
          estado: true,

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
        },
      },
      select: {
        id: true,
        sucursalId: true,
      },
    });

    if (!categoria) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return categoria;
  }

  private async buscarProductoDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const producto = await this.prisma.producto.findFirst({
      where: {
        id,
        estado: true,

        categoria: {
          estado: true,

          sucursal: {
            estado: true,

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
          },
        },
      },
    });

    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }

    return producto;
  }

  private normalizarCodigo(codigo: string | undefined) {
    if (codigo === undefined) return undefined;
    const limpio = codigo.trim().toUpperCase();
    return limpio.length > 0 ? limpio : null;
  }

  private async validarCodigoDisponible(
    codigo: string | null | undefined,
    sucursalId: number,
    exceptoProductoId?: number,
  ) {
    if (!codigo) return;
    const repetido = await this.prisma.producto.findFirst({
      where: {
        codigo,
        ...(exceptoProductoId ? { id: { not: exceptoProductoId } } : {}),
        categoria: { sucursalId },
      },
      select: { id: true },
    });
    if (repetido) {
      throw new BadRequestException(
        `Ya existe un producto con el código ${codigo} en esta sucursal`,
      );
    }
  }

  private async validarEstacion(
    estacionId: number | undefined,
    sucursalId: number,
  ) {
    if (estacionId === undefined) return;
    const estacion = await this.prisma.estacionPreparacion.findFirst({
      where: { id: estacionId, sucursalId, estado: true },
      select: { id: true },
    });
    if (!estacion) {
      throw new NotFoundException(
        'Estación de preparación no encontrada en la sucursal del producto',
      );
    }
  }

  async create(data: CreateProductoDto, usuarioActual: UsuarioAutenticado) {
    this.validarCapacidadesInventario(data.estrategiaInventario, usuarioActual);

    const categoria = await this.validarCategoriaDentroDelAlcance(
      data.categoriaId,
      usuarioActual,
    );
    await this.validarEstacion(data.estacionId, categoria.sucursalId);
    const codigo = this.normalizarCodigo(data.codigo);
    await this.validarCodigoDisponible(codigo, categoria.sucursalId);

    return this.prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({ data: { ...data, codigo } });
      await this.syncBusiness.encolarProducto(tx, producto.id);
      return producto;
    });
  }

  async findAll(usuarioActual: UsuarioAutenticado, sucursalId?: number) {
    const productos = await this.prisma.producto.findMany({
      where: {
        estado: true,

        categoria: {
          estado: true,

          sucursal: {
            estado: true,

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
            ...(sucursalId ? { AND: [{ id: sucursalId }] } : {}),
          },
        },
      },

      include: {
        recetas: true,
        categoria: true,
        estacion: true,
        modificadores: { where: { activo: true }, orderBy: { orden: 'asc' } },
      },

      orderBy: {
        id: 'asc',
      },
      take: 500,
    });
    if (productos.length === 0) return productos;
    const imagenes = await imagenProductoDb(this.prisma).findMany({
      where: {
        productoId: { in: productos.map((producto) => producto.id) },
        estado: 'ACTIVA',
      },
    });
    const porProducto = new Map(
      imagenes.map((imagen) => [imagen.productoId, imagen]),
    );
    return productos.map((producto) => ({
      ...producto,
      imagenPrincipal: porProducto.get(producto.id) ?? null,
    }));
  }

  async gestionarModificadores(
    id: number,
    modificadores: Array<{
      nombre: string;
      precio: number;
      activo?: boolean;
      orden?: number;
    }>,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.buscarProductoDentroDelAlcance(id, usuarioActual);
    const nombres = modificadores.map((item) =>
      item.nombre.trim().toLowerCase(),
    );
    if (new Set(nombres).size !== nombres.length) {
      throw new BadRequestException(
        'Los modificadores no pueden repetir nombre',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.productoModificador.deleteMany({
        where: { productoId: id, detalles: { none: {} } },
      });
      const existentes = await tx.productoModificador.findMany({
        where: { productoId: id },
        select: { id: true, nombre: true },
      });
      const porNombre = new Map(
        existentes.map((item) => [item.nombre.toLowerCase(), item]),
      );
      for (const [index, item] of modificadores.entries()) {
        const nombre = item.nombre.trim();
        const existente = porNombre.get(nombre.toLowerCase());
        if (existente) {
          await tx.productoModificador.update({
            where: { id: existente.id },
            data: {
              nombre,
              precio: item.precio,
              activo: item.activo ?? true,
              orden: item.orden ?? index,
            },
          });
        } else {
          await tx.productoModificador.create({
            data: {
              productoId: id,
              nombre,
              precio: item.precio,
              activo: item.activo ?? true,
              orden: item.orden ?? index,
            },
          });
        }
      }
      const deseados = new Set(nombres);
      await tx.productoModificador.updateMany({
        where: {
          productoId: id,
          nombre: { notIn: modificadores.map((item) => item.nombre.trim()) },
        },
        data: { activo: false },
      });
      void deseados;
      const resultado = await tx.productoModificador.findMany({
        where: { productoId: id, activo: true },
        orderBy: { orden: 'asc' },
      });
      await this.syncBusiness.encolarProducto(tx, id);
      return resultado;
    });
  }

  async update(
    id: number,
    data: UpdateProductoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const producto = await this.buscarProductoDentroDelAlcance(
      id,
      usuarioActual,
    );
    const categoria = await this.prisma.categoria.findUniqueOrThrow({
      where: { id: producto.categoriaId },
      select: { sucursalId: true },
    });
    if (data.estacionId !== undefined) {
      await this.validarEstacion(data.estacionId, categoria.sucursalId);
    }
    const codigo = this.normalizarCodigo(data.codigo);
    if (data.codigo !== undefined) {
      await this.validarCodigoDisponible(codigo, categoria.sucursalId, id);
    }

    if (data.estrategiaInventario !== undefined) {
      this.validarCapacidadesInventario(
        data.estrategiaInventario,
        usuarioActual,
      );
    }

    if (producto.stock.gt(0)) {
      if (
        data.unidadInventario !== undefined &&
        data.unidadInventario !== producto.unidadInventario
      ) {
        throw new BadRequestException(
          'No se puede cambiar la unidad de inventario de un producto con stock existente. Ajuste primero el stock a cero.',
        );
      }

      if (
        data.estrategiaInventario !== undefined &&
        data.estrategiaInventario !== producto.estrategiaInventario
      ) {
        throw new BadRequestException(
          'No se puede cambiar la estrategia de inventario de un producto con stock existente. Ajuste primero el stock a cero.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.producto.update({
        where: { id },
        data: data.codigo === undefined ? data : { ...data, codigo },
      });
      await this.syncBusiness.encolarProducto(tx, actualizado.id);
      return actualizado;
    });
  }
}
