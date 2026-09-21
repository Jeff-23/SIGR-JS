import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/auditoria-contexto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';

@Injectable()
export class SucursalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private async validarRestauranteActivo(restauranteId: number) {
    const restaurante = await this.prisma.restaurante.findFirst({
      where: { id: restauranteId, estado: true },
    });
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado');
    return restaurante;
  }

  private async validarLimiteSedes(restauranteId: number) {
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: {
        nombre: true,
        plan: {
          select: {
            codigo: true,
            nombre: true,
            activo: true,
            sedesIncluidas: true,
            maxSedes: true,
          },
        },
        _count: {
          select: { sucursales: { where: { estado: true } } },
        },
      },
    });

    if (!restaurante?.plan?.activo) return;
    const actuales = restaurante._count.sucursales;
    if (actuales >= restaurante.plan.maxSedes) {
      throw new ForbiddenException(
        `El plan ${restaurante.plan.nombre} permite máximo ${restaurante.plan.maxSedes} sede(s) activas. Para crecer por encima de ese tope se requiere un ajuste comercial del plan.`,
      );
    }
  }

  private async buscarDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (usuarioActual.sucursalId !== null && usuarioActual.sucursalId !== id) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    const where: { id: number; estado: boolean; restauranteId?: number } = {
      id,
      estado: true,
    };
    if (!this.esSuperadmin(usuarioActual)) {
      where.restauranteId = usuarioActual.restauranteId!;
    }

    const sucursal = await this.prisma.sucursal.findFirst({ where });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }

  async create(
    data: CreateSucursalDto,
    usuarioActual: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.sucursalId !== null
    ) {
      throw new ForbiddenException(
        'Un administrador limitado a sucursal no puede crear nuevas sucursales',
      );
    }
    if (
      !this.esSuperadmin(usuarioActual) &&
      data.restauranteId !== usuarioActual.restauranteId
    ) {
      throw new ForbiddenException(
        'No puedes crear sucursales para otro restaurante',
      );
    }

    await this.validarRestauranteActivo(data.restauranteId);
    await this.validarLimiteSedes(data.restauranteId);

    return this.prisma.$transaction(async (tx) => {
      const sucursal = await tx.sucursal.create({
        data: {
          ...data,
          estacionesPreparacion: {
            create: [
              {
                codigo: 'COCINA',
                nombre: 'Cocina',
                color: '#F97316',
                orden: 10,
              },
              { codigo: 'BAR', nombre: 'Bar', color: '#3B82F6', orden: 20 },
              {
                codigo: 'DESPACHO',
                nombre: 'Despacho',
                color: '#8B5CF6',
                orden: 30,
                objetivoPreparacionMin: 5,
              },
            ],
          },
        },
        include: { estacionesPreparacion: true },
      });
      await tx.configuracionSucursal.createMany({
        data: [
          {
            sucursalId: sucursal.id,
            clave: 'ZONA_HORARIA',
            valor: 'America/Bogota',
          },
          { sucursalId: sucursal.id, clave: 'ANCHO_PAPEL', valor: 80 },
          { sucursalId: sucursal.id, clave: 'QR_MODO', valor: 'SOLO_MENU' },
        ],
        skipDuplicates: true,
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: 'SUCURSAL_CREADA',
          recurso: 'SUCURSAL',
          recursoId: sucursal.id,
          restauranteId: sucursal.restauranteId,
          sucursalId: sucursal.id,
          despues: sucursal,
        },
        contexto,
      );
      return sucursal;
    });
  }

  findAll(usuarioActual: UsuarioAutenticado) {
    if (this.esSuperadmin(usuarioActual)) {
      return this.prisma.sucursal.findMany({
        where: { estado: true },
        orderBy: { id: 'asc' },
      });
    }
    if (usuarioActual.sucursalId !== null) {
      return this.prisma.sucursal.findMany({
        where: {
          id: usuarioActual.sucursalId,
          restauranteId: usuarioActual.restauranteId,
          estado: true,
        },
      });
    }
    return this.prisma.sucursal.findMany({
      where: { restauranteId: usuarioActual.restauranteId, estado: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number, usuarioActual: UsuarioAutenticado) {
    await this.buscarDentroDelAlcance(id, usuarioActual);
    return this.prisma.sucursal.findUnique({
      where: { id },
      include: {
        configuraciones: {
          where: { clave: { in: ['ZONA_HORARIA', 'ANCHO_PAPEL', 'QR_MODO'] } },
          orderBy: { clave: 'asc' },
        },
      },
    });
  }

  async update(
    id: number,
    data: UpdateSucursalDto,
    usuarioActual: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    const anterior = await this.buscarDentroDelAlcance(id, usuarioActual);
    const cambios = { ...data };
    delete cambios.restauranteId;

    return this.prisma.$transaction(async (tx) => {
      const sucursal = await tx.sucursal.update({
        where: { id },
        data: cambios,
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: 'SUCURSAL_ACTUALIZADA',
          recurso: 'SUCURSAL',
          recursoId: id,
          restauranteId: sucursal.restauranteId,
          sucursalId: id,
          antes: anterior,
          despues: sucursal,
        },
        contexto,
      );
      return sucursal;
    });
  }

  async remove(
    id: number,
    usuarioActual: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    const anterior = await this.buscarDentroDelAlcance(id, usuarioActual);

    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.sucursalId !== null
    ) {
      throw new ForbiddenException(
        'Un administrador limitado a sucursal no puede desactivar su sucursal',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const sucursal = await tx.sucursal.update({
        where: { id },
        data: { estado: false },
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: 'SUCURSAL_DESACTIVADA',
          recurso: 'SUCURSAL',
          recursoId: id,
          restauranteId: sucursal.restauranteId,
          sucursalId: id,
          antes: anterior,
          despues: sucursal,
        },
        contexto,
      );
      return sucursal;
    });
  }
}
