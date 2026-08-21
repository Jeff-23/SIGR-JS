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

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.producto.create({
      data,
    });
  }

  async findAll(usuarioActual: UsuarioAutenticado, sucursalId?: number) {
    return this.prisma.producto.findMany({
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
            ...(sucursalId ? { id: sucursalId } : {}),
          },
        },
      },

      include: {
        recetas: true,
        categoria: true,
        estacion: true,
      },

      orderBy: {
        id: 'asc',
      },
      take: 500,
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
    if (data.estacionId !== undefined) {
      const categoria = await this.prisma.categoria.findUniqueOrThrow({
        where: { id: producto.categoriaId },
        select: { sucursalId: true },
      });
      await this.validarEstacion(data.estacionId, categoria.sucursalId);
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

    return this.prisma.producto.update({
      where: {
        id,
      },
      data,
    });
  }
}
