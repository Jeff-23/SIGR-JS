import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCategoriaDto,
  UpdateCategoriaDto,
} from './dto/create-categoria.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncBusinessService } from '../sync/sync-business.service';

@Injectable()
export class CategoriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncBusiness: SyncBusinessService,
  ) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private async validarSucursalDentroDelAlcance(
    sucursalId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (
      usuarioActual.sucursalId !== null &&
      usuarioActual.sucursalId !== sucursalId
    ) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        estado: true,
        ...(!this.esSuperadmin(usuarioActual)
          ? {
              restauranteId: usuarioActual.restauranteId,
            }
          : {}),
      },
    });

    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    return sucursal;
  }

  private async validarPerfiles(
    sucursalId: number,
    perfilCartaIds: number[] | undefined,
  ) {
    if (perfilCartaIds === undefined) return undefined;
    const unicos = [...new Set(perfilCartaIds)];
    if (!unicos.length) return [];
    const encontrados = await this.prisma.perfilCarta.findMany({
      where: { id: { in: unicos }, sucursalId, estado: true },
      select: { id: true },
    });
    if (encontrados.length !== unicos.length) {
      throw new BadRequestException(
        'Uno o más turnos operativos no pertenecen a esta sucursal o están inactivos',
      );
    }
    return unicos;
  }

  private async validarTurnos(
    sucursalId: number,
    turnoOperativoIds: number[] | undefined,
  ) {
    if (turnoOperativoIds === undefined) return undefined;
    const unicos = [...new Set(turnoOperativoIds)];
    if (!unicos.length) return [];
    const encontrados = await this.prisma.turnoOperativo.findMany({
      where: { id: { in: unicos }, sucursalId, estado: true },
      select: { id: true },
    });
    if (encontrados.length !== unicos.length) {
      throw new BadRequestException(
        'Uno o más turnos operativos no pertenecen a esta sucursal o están inactivos',
      );
    }
    return unicos;
  }

  async create(data: CreateCategoriaDto, usuarioActual: UsuarioAutenticado) {
    await this.validarSucursalDentroDelAlcance(data.sucursalId, usuarioActual);
    const perfilesSolicitados = await this.validarPerfiles(
      data.sucursalId,
      data.perfilCartaIds,
    );
    const turnosSolicitados = await this.validarTurnos(
      data.sucursalId,
      data.turnoOperativoIds,
    );

    return this.prisma.$transaction(async (tx) => {
      const perfiles =
        perfilesSolicitados ??
        (
          await tx.perfilCarta.findMany({
            where: { sucursalId: data.sucursalId, estado: true },
            select: { id: true },
          })
        ).map((item) => item.id);

      const turnos =
        turnosSolicitados ??
        (await tx.turnoOperativo.findMany({
          where: { sucursalId: data.sucursalId, estado: true },
          select: { id: true },
        })).map((item) => item.id);

      const categoria = await tx.categoria.create({
        data: {
          nombre: data.nombre.trim(),
          descripcion: data.descripcion?.trim() || null,
          sucursalId: data.sucursalId,
          ...(perfiles.length
            ? { perfilesCarta: { create: perfiles.map((perfilCartaId) => ({ perfilCartaId })) } }
            : {}),
          ...(turnos.length
            ? { turnosOperativos: { create: turnos.map((turnoOperativoId) => ({ turnoOperativoId })) } }
            : {}),
        },
        include: {
          perfilesCarta: { select: { perfilCartaId: true } },
          turnosOperativos: { select: { turnoOperativoId: true } },
        },
      });
      await this.syncBusiness.encolarCategoria(tx, categoria.id);
      return {
        ...categoria,
        perfilCartaIds: categoria.perfilesCarta.map((item) => item.perfilCartaId),
        turnoOperativoIds: categoria.turnosOperativos.map((item) => item.turnoOperativoId),
      };
    });
  }

  async update(
    id: number,
    data: UpdateCategoriaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const categoria = await this.prisma.categoria.findFirst({
      where: {
        id,
        estado: true,
        sucursal: {
          estado: true,
          ...(!this.esSuperadmin(usuarioActual)
            ? { restauranteId: usuarioActual.restauranteId }
            : {}),
          ...(usuarioActual.sucursalId !== null
            ? { id: usuarioActual.sucursalId }
            : {}),
        },
      },
      select: { id: true, sucursalId: true },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');

    const perfiles = await this.validarPerfiles(
      categoria.sucursalId,
      data.perfilCartaIds,
    );
    const turnos = await this.validarTurnos(
      categoria.sucursalId,
      data.turnoOperativoIds,
    );

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.categoria.update({
        where: { id },
        data: {
          ...(data.nombre !== undefined ? { nombre: data.nombre.trim() } : {}),
          ...(data.descripcion !== undefined
            ? { descripcion: data.descripcion.trim() || null }
            : {}),
        },
      });

      if (perfiles !== undefined) {
        await tx.perfilCartaCategoria.deleteMany({
          where: { categoriaId: id },
        });
        if (perfiles.length) {
          await tx.perfilCartaCategoria.createMany({
            data: perfiles.map((perfilCartaId) => ({
              perfilCartaId,
              categoriaId: id,
            })),
          });
        }
      }

      if (turnos !== undefined) {
        await tx.categoriaTurnoOperativo.deleteMany({ where: { categoriaId: id } });
        if (turnos.length) {
          await tx.categoriaTurnoOperativo.createMany({
            data: turnos.map((turnoOperativoId) => ({ categoriaId: id, turnoOperativoId })),
          });
        }
      }

      await this.syncBusiness.encolarCategoria(tx, actualizada.id);
      const asociaciones = await tx.perfilCartaCategoria.findMany({
        where: { categoriaId: id },
        select: { perfilCartaId: true },
      });
      const asociacionesTurno = await tx.categoriaTurnoOperativo.findMany({
        where: { categoriaId: id },
        select: { turnoOperativoId: true },
      });
      return {
        ...actualizada,
        perfilCartaIds: asociaciones.map((item) => item.perfilCartaId),
        turnoOperativoIds: asociacionesTurno.map((item) => item.turnoOperativoId),
      };
    });
  }

  async findAllPorSucursal(
    sucursalId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(sucursalId, usuarioActual);

    const categorias = await this.prisma.categoria.findMany({
      where: {
        sucursalId,
        estado: true,
      },
      include: {
        perfilesCarta: {
          select: { perfilCartaId: true, perfilCarta: { select: { nombre: true, orden: true } } },
          orderBy: { perfilCartaId: 'asc' },
        },
        turnosOperativos: {
          select: { turnoOperativoId: true, turnoOperativo: { select: { nombre: true, orden: true } } },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    return categorias.map((categoria) => ({
      ...categoria,
      perfilCartaIds: categoria.perfilesCarta.map((item) => item.perfilCartaId),
      turnoOperativoIds: categoria.turnosOperativos.map((item) => item.turnoOperativoId),
      turnosOperativos: categoria.turnosOperativos
        .map((item) => item.turnoOperativo.nombre)
        .join(', '),
    }));
  }
}
