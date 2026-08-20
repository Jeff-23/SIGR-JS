import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AmbitoRol } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ContextoAuditoria } from '../auditoria/auditoria-contexto';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class AutorizacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async catalogo(usuario: UsuarioAutenticado) {
    const global = this.esSuperadminGlobal(usuario);
    const [planes, capacidades, permisos] = await Promise.all([
      this.prisma.plan.findMany({
        where: global
          ? undefined
          : {
              restaurantes: {
                some: { id: usuario.restauranteId ?? -1 },
              },
            },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          activo: true,
          capacidades: {
            select: { capacidad: { select: { codigo: true } } },
          },
        },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.capacidad.findMany({
        where: global ? undefined : { activo: true },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.permiso.findMany({
        where: { activo: true },
        orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }],
      }),
    ]);

    return { planes, capacidades, permisos };
  }

  async listarRoles(usuario: UsuarioAutenticado) {
    const restauranteId = this.exigirAdministradorRestaurante(usuario, false);
    return this.prisma.rol.findMany({
      where: { restauranteId, ambito: AmbitoRol.RESTAURANTE },
      select: {
        id: true,
        clave: true,
        nombre: true,
        descripcion: true,
        permisos: {
          where: { permiso: { activo: true } },
          select: {
            permiso: { select: { codigo: true, nombre: true, modulo: true } },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async asignarPlan(
    restauranteId: number,
    planId: number,
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    this.exigirSuperadminGlobal(usuario);
    const [restaurante, plan] = await Promise.all([
      this.prisma.restaurante.findUnique({
        where: { id: restauranteId },
        select: { id: true, planId: true },
      }),
      this.prisma.plan.findFirst({
        where: { id: planId, activo: true },
        select: { id: true },
      }),
    ]);
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado');
    if (!plan)
      throw new BadRequestException('El plan no existe o está inactivo');

    return this.prisma.$transaction(async (tx) => {
      const resultado = await tx.restaurante.update({
        where: { id: restauranteId },
        data: { planId },
        select: {
          id: true,
          nombre: true,
          plan: { select: { id: true, codigo: true } },
        },
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: 'PLAN_ASIGNADO',
          recurso: 'RESTAURANTE',
          recursoId: restauranteId,
          restauranteId,
          antes: { planId: restaurante.planId },
          despues: { planId, codigo: resultado.plan?.codigo },
        },
        contexto,
      );
      return resultado;
    });
  }

  async actualizarCapacidadesPlan(
    planId: number,
    codigos: string[],
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    this.exigirSuperadminGlobal(usuario);
    const [plan, capacidades] = await Promise.all([
      this.prisma.plan.findUnique({
        where: { id: planId },
        select: {
          id: true,
          capacidades: { select: { capacidad: { select: { codigo: true } } } },
        },
      }),
      this.prisma.capacidad.findMany({
        where: { codigo: { in: codigos }, activo: true },
        select: { id: true, codigo: true },
      }),
    ]);
    if (!plan) throw new NotFoundException('Plan no encontrado');
    this.validarCodigosCompletos(
      codigos,
      capacidades.map((item) => item.codigo),
      'capacidades',
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.planCapacidad.deleteMany({ where: { planId } });
      if (capacidades.length) {
        await tx.planCapacidad.createMany({
          data: capacidades.map((capacidad) => ({
            planId,
            capacidadId: capacidad.id,
          })),
        });
      }
      await this.auditoria.registrar(
        tx,
        {
          accion: 'CAPACIDADES_PLAN_ACTUALIZADAS',
          recurso: 'PLAN',
          recursoId: planId,
          antes: {
            codigos: plan.capacidades.map((item) => item.capacidad.codigo),
          },
          despues: { codigos },
        },
        contexto,
      );
    });

    return this.prisma.plan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        codigo: true,
        capacidades: { select: { capacidad: { select: { codigo: true } } } },
      },
    });
  }

  async actualizarPermisosRol(
    rolId: number,
    codigos: string[],
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    const restauranteId = this.exigirAdministradorRestaurante(usuario, true);
    const [rol, permisos] = await Promise.all([
      this.prisma.rol.findFirst({
        where: { id: rolId, restauranteId, ambito: AmbitoRol.RESTAURANTE },
        select: {
          id: true,
          permisos: { select: { permiso: { select: { codigo: true } } } },
        },
      }),
      this.prisma.permiso.findMany({
        where: { codigo: { in: codigos }, activo: true },
        select: { id: true, codigo: true },
      }),
    ]);
    if (!rol) throw new NotFoundException('Rol no encontrado');
    this.validarCodigosCompletos(
      codigos,
      permisos.map((item) => item.codigo),
      'permisos',
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.rolPermiso.deleteMany({ where: { rolId } });
      if (permisos.length) {
        await tx.rolPermiso.createMany({
          data: permisos.map((permiso) => ({ rolId, permisoId: permiso.id })),
        });
      }
      await this.auditoria.registrar(
        tx,
        {
          accion: 'PERMISOS_ROL_ACTUALIZADOS',
          recurso: 'ROL',
          recursoId: rolId,
          restauranteId,
          antes: { codigos: rol.permisos.map((item) => item.permiso.codigo) },
          despues: { codigos },
        },
        contexto,
      );
    });

    return this.prisma.rol.findUnique({
      where: { id: rolId },
      select: {
        id: true,
        clave: true,
        nombre: true,
        permisos: { select: { permiso: { select: { codigo: true } } } },
      },
    });
  }

  private validarCodigosCompletos(
    solicitados: string[],
    encontrados: string[],
    entidad: string,
  ) {
    const disponibles = new Set(encontrados);
    const faltantes = solicitados.filter((codigo) => !disponibles.has(codigo));
    if (faltantes.length) {
      throw new BadRequestException(
        `Códigos de ${entidad} inválidos o inactivos: ${faltantes.join(', ')}`,
      );
    }
  }

  private esSuperadminGlobal(usuario: UsuarioAutenticado): boolean {
    return usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
  }

  private exigirSuperadminGlobal(usuario: UsuarioAutenticado) {
    if (!this.esSuperadminGlobal(usuario)) {
      throw new ForbiddenException('La operación requiere SUPERADMIN global');
    }
  }

  private exigirAdministradorRestaurante(
    usuario: UsuarioAutenticado,
    gestionar: boolean,
  ): number {
    if (usuario.restauranteId === null) {
      throw new ForbiddenException(
        'La operación requiere contexto de restaurante',
      );
    }
    if (usuario.sucursalId !== null) {
      throw new ForbiddenException(
        'Un usuario limitado a sucursal no puede administrar autorización',
      );
    }
    if (gestionar && usuario.rol !== 'ADMIN') {
      throw new ForbiddenException(
        'La operación requiere el rol ADMIN del restaurante',
      );
    }
    return usuario.restauranteId;
  }
}
