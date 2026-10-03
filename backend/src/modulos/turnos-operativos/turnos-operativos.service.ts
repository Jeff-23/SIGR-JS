import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarTurnoOperativoDto, CrearTurnoOperativoDto } from './dto/turno-operativo.dto';

@Injectable()
export class TurnosOperativosService {
  constructor(private readonly prisma: PrismaService) {}

  private async sucursalEnAlcance(sucursalId: number, usuario: UsuarioAutenticado) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        estado: true,
        ...(usuario.restauranteId === null ? {} : { restauranteId: usuario.restauranteId }),
        ...(usuario.sucursalId === null ? {} : { id: usuario.sucursalId }),
      },
      select: { id: true },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
  }

  async listar(sucursalId: number, usuario: UsuarioAutenticado, incluirInactivos = false) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    return this.prisma.turnoOperativo.findMany({
      where: { sucursalId, ...(incluirInactivos ? {} : { estado: true }) },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  async crear(dto: CrearTurnoOperativoDto, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(dto.sucursalId, usuario);
    const nombre = dto.nombre.trim();
    const repetido = await this.prisma.turnoOperativo.findFirst({
      where: { sucursalId: dto.sucursalId, nombre: { equals: nombre, mode: 'insensitive' } },
      select: { id: true },
    });
    if (repetido) throw new BadRequestException('Ya existe un turno operativo con ese nombre');
    return this.prisma.turnoOperativo.create({
      data: { sucursalId: dto.sucursalId, nombre, estado: dto.estado ?? true, orden: dto.orden ?? 0 },
    });
  }

  async actualizar(id: number, dto: ActualizarTurnoOperativoDto, usuario: UsuarioAutenticado) {
    const turno = await this.prisma.turnoOperativo.findFirst({
      where: {
        id,
        sucursal: {
          ...(usuario.restauranteId === null ? {} : { restauranteId: usuario.restauranteId }),
          ...(usuario.sucursalId === null ? {} : { id: usuario.sucursalId }),
        },
      },
      select: { id: true, sucursalId: true },
    });
    if (!turno) throw new NotFoundException('Turno operativo no encontrado');
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      const repetido = await this.prisma.turnoOperativo.findFirst({
        where: { id: { not: id }, sucursalId: turno.sucursalId, nombre: { equals: nombre, mode: 'insensitive' } },
        select: { id: true },
      });
      if (repetido) throw new BadRequestException('Ya existe un turno operativo con ese nombre');
    }
    return this.prisma.turnoOperativo.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
        ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
      },
    });
  }
}
