import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/auditoria-contexto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CreateRestauranteDto } from './dto/create-restaurante.dto';
import { UpdateRestauranteDto } from './dto/update-restaurante.dto';

@Injectable()
export class RestaurantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private async buscarDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.restauranteId !== id
    ) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const restaurante = await this.prisma.restaurante.findFirst({
      where: {
        id,
        estado: true,
      },
    });

    if (!restaurante) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    return restaurante;
  }

  async create(
    data: CreateRestauranteDto,
    usuarioActual: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    if (!this.esSuperadmin(usuarioActual)) {
      throw new ForbiddenException(
        'Solo un administrador de plataforma puede crear restaurantes',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const restaurante = await tx.restaurante.create({ data });
      await tx.configuracionRestaurante.createMany({
        data: [
          { restauranteId: restaurante.id, clave: 'MONEDA', valor: 'COP' },
          {
            restauranteId: restaurante.id,
            clave: 'ZONA_HORARIA',
            valor: 'America/Bogota',
          },
        ],
        skipDuplicates: true,
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: 'RESTAURANTE_CREADO',
          recurso: 'RESTAURANTE',
          recursoId: restaurante.id,
          restauranteId: restaurante.id,
          despues: restaurante,
        },
        contexto,
      );
      return restaurante;
    });
  }

  findAll(usuarioActual: UsuarioAutenticado) {
    if (this.esSuperadmin(usuarioActual)) {
      return this.prisma.restaurante.findMany({
        where: {
          estado: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
    }

    return this.prisma.restaurante.findMany({
      where: {
        id: usuarioActual.restauranteId,
        estado: true,
      },
    });
  }

  async findOne(id: number, usuarioActual: UsuarioAutenticado) {
    await this.buscarDentroDelAlcance(id, usuarioActual);

    const filtroSucursales =
      usuarioActual.sucursalId !== null
        ? {
            id: usuarioActual.sucursalId,
            estado: true,
          }
        : {
            estado: true,
          };

    return this.prisma.restaurante.findUnique({
      where: { id },
      include: {
        sucursales: {
          where: filtroSucursales,
          orderBy: { id: 'asc' },
        },
        configuraciones: {
          where: { clave: { in: ['MONEDA', 'ZONA_HORARIA'] } },
          orderBy: { clave: 'asc' },
        },
        perfilFiscal: true,
      },
    });
  }

  async update(
    id: number,
    data: UpdateRestauranteDto,
    usuarioActual: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    const anterior = await this.buscarDentroDelAlcance(id, usuarioActual);

    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.sucursalId !== null
    ) {
      throw new ForbiddenException(
        'Un administrador limitado a sucursal no puede modificar el restaurante',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const restaurante = await tx.restaurante.update({ where: { id }, data });
      await this.auditoria.registrar(
        tx,
        {
          accion: 'RESTAURANTE_ACTUALIZADO',
          recurso: 'RESTAURANTE',
          recursoId: id,
          restauranteId: id,
          antes: anterior,
          despues: restaurante,
        },
        contexto,
      );
      return restaurante;
    });
  }

  async remove(
    id: number,
    password: string,
    usuarioActual: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    if (!this.esSuperadmin(usuarioActual)) {
      throw new ForbiddenException(
        'Solo un administrador de plataforma puede desactivar restaurantes',
      );
    }

    const anterior = await this.buscarDentroDelAlcance(id, usuarioActual);
    const usuarioDb = await this.prisma.usuario.findUnique({
      where: { id: usuarioActual.id },
      select: { password: true, activo: true },
    });
    if (
      !usuarioDb?.activo ||
      !(await bcrypt.compare(password, usuarioDb.password))
    ) {
      throw new ForbiddenException('Reautenticación inválida');
    }

    return this.prisma.$transaction(async (tx) => {
      const restaurante = await tx.restaurante.update({
        where: { id },
        data: { estado: false },
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: 'RESTAURANTE_DESACTIVADO',
          recurso: 'RESTAURANTE',
          recursoId: id,
          restauranteId: id,
          antes: anterior,
          despues: restaurante,
        },
        contexto,
      );
      return restaurante;
    });
  }
}
