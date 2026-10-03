import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AmbitoRol } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncBusinessService } from '../sync/sync-business.service';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncBusinessService,
  ) {}

  private readonly usuarioPublicoSelect = {
    id: true,
    nombres: true,
    apellidos: true,
    email: true,
    activo: true,
    rolId: true,
    restauranteId: true,
    sucursalId: true,
    perfilCartaId: true,
    turnoOperativoActivoId: true,
    creadoEn: true,

    rol: {
      select: {
        id: true,
        nombre: true,
      },
    },

    rolesAsignados: {
      select: {
        rol: {
          select: {
            id: true,
            clave: true,
            nombre: true,
          },
        },
      },
      orderBy: { creadoEn: 'asc' as const },
    },

    restaurante: {
      select: {
        id: true,
        nombre: true,
      },
    },

    sucursal: {
      select: {
        id: true,
        nombre: true,
      },
    },
    perfilCartaOperativa: {
      select: { id: true, nombre: true, estado: true, sucursalId: true },
    },
    turnoOperativoActivo: {
      select: { id: true, nombre: true, estado: true, sucursalId: true },
    },
    turnosOperativos: {
      select: { turnoOperativo: { select: { id: true, nombre: true, estado: true, sucursalId: true } } },
      orderBy: { creadoEn: 'asc' as const },
    },
  } as const;

  private obtenerFiltroAlcance(usuarioActual: UsuarioAutenticado) {
    // Superadministrador de SIGR.
    if (usuarioActual.restauranteId === null) {
      return {};
    }

    // Administrador limitado a una sucursal.
    if (usuarioActual.sucursalId !== null) {
      return {
        restauranteId: usuarioActual.restauranteId,
        sucursalId: usuarioActual.sucursalId,
      };
    }

    // Administrador de todo un restaurante.
    return {
      restauranteId: usuarioActual.restauranteId,
    };
  }

  private normalizarRolIds(
    rolId?: number,
    rolIds?: number[],
    fallback: number[] = [],
  ): number[] {
    const candidatos = rolIds?.length
      ? rolIds
      : rolId !== undefined
        ? [rolId]
        : fallback;
    const unicos = [...new Set(candidatos)];
    if (!unicos.length) {
      throw new BadRequestException('Debes asignar al menos un rol');
    }
    return unicos;
  }

  private async validarRolesParaDestino(
    rolIds: number[],
    restauranteDestino: number | null,
    usuarioActual: UsuarioAutenticado,
  ) {
    const roles = await Promise.all(
      rolIds.map((rolId) =>
        this.validarRolParaDestino(rolId, restauranteDestino, usuarioActual),
      ),
    );

    if (roles.length > 1) {
      const exclusivos = new Set(['ADMIN', 'ADMIN_SEDE', 'CONTADOR']);
      const rolExclusivo = roles.find(
        (rol) => rol.ambito === AmbitoRol.SISTEMA || exclusivos.has(rol.nombre),
      );
      if (rolExclusivo) {
        throw new BadRequestException(
          `El rol ${rolExclusivo.nombre} es exclusivo y no puede combinarse con otros roles`,
        );
      }
    }

    return roles;
  }

  private async validarRolParaDestino(
    rolId: number,
    restauranteDestino: number | null,
    usuarioActual: UsuarioAutenticado,
  ) {
    const rol = await this.prisma.rol.findUnique({
      where: {
        id: rolId,
      },

      select: {
        id: true,
        clave: true,
        nombre: true,
        ambito: true,
        restauranteId: true,
      },
    });

    if (!rol) {
      throw new BadRequestException('El rol indicado no existe');
    }

    // Todos los roles utilizables deben tener
    // clave técnica y ámbito configurados.
    if (!rol.clave || !rol.ambito) {
      throw new BadRequestException(
        'El rol indicado no está configurado correctamente',
      );
    }

    const esSuperadmin =
      usuarioActual.restauranteId === null &&
      usuarioActual.rol === 'SUPERADMIN';

    // ==========================================
    // ROL GLOBAL DE LA PLATAFORMA
    // ==========================================

    if (rol.ambito === AmbitoRol.SISTEMA) {
      if (!esSuperadmin) {
        throw new ForbiddenException('No puedes asignar roles de sistema');
      }

      if (restauranteDestino !== null) {
        throw new BadRequestException(
          'Un rol de sistema solo puede asignarse a un usuario global',
        );
      }

      return rol;
    }

    // ==========================================
    // ROL PROPIO DE UN RESTAURANTE
    // ==========================================

    if (rol.ambito === AmbitoRol.RESTAURANTE) {
      if (restauranteDestino === null) {
        throw new BadRequestException(
          'Un rol de restaurante requiere un restaurante',
        );
      }

      if (
        rol.restauranteId === null ||
        rol.restauranteId !== restauranteDestino
      ) {
        throw new ForbiddenException(
          'El rol no pertenece al restaurante destino',
        );
      }

      // Un usuario perteneciente a un restaurante
      // solo puede asignar roles de su propia empresa.
      if (!esSuperadmin && usuarioActual.restauranteId !== rol.restauranteId) {
        throw new ForbiddenException(
          'No puedes asignar roles de otro restaurante',
        );
      }

      return rol;
    }

    throw new BadRequestException('El ámbito del rol no es válido');
  }

  private async validarRestaurante(restauranteId: number) {
    const restaurante = await this.prisma.restaurante.findFirst({
      where: {
        id: restauranteId,
        estado: true,
      },
    });

    if (!restaurante) {
      throw new BadRequestException(
        'El restaurante indicado no existe o está inactivo',
      );
    }

    return restaurante;
  }

  private async validarPerfilCartaOperativa(
    perfilCartaId: number | null | undefined,
    sucursalId: number | null,
  ) {
    if (perfilCartaId === undefined || perfilCartaId === null) return null;
    if (sucursalId === null) {
      throw new BadRequestException(
        'Para asignar un turno operativo el usuario debe pertenecer a una sucursal',
      );
    }
    const perfil = await this.prisma.perfilCarta.findFirst({
      where: { id: perfilCartaId, sucursalId, estado: true },
      select: { id: true },
    });
    if (!perfil) {
      throw new BadRequestException(
        'El turno operativo no pertenece a la sucursal del usuario o está inactivo',
      );
    }
    return perfil.id;
  }

  private async validarTurnosOperativos(
    turnoOperativoIds: number[] | undefined,
    sucursalId: number | null,
  ) {
    if (turnoOperativoIds === undefined) return undefined;
    const unicos = [...new Set(turnoOperativoIds)];
    if (!unicos.length) return [];
    if (sucursalId === null) {
      throw new BadRequestException(
        'Para asignar turnos operativos el usuario debe pertenecer a una sucursal',
      );
    }
    const encontrados = await this.prisma.turnoOperativo.findMany({
      where: { id: { in: unicos }, sucursalId, estado: true },
      select: { id: true },
    });
    if (encontrados.length !== unicos.length) {
      throw new BadRequestException(
        'Uno o más turnos operativos no pertenecen a la sucursal o están inactivos',
      );
    }
    return unicos;
  }

  private async validarSucursal(sucursalId: number, restauranteId: number) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        restauranteId,
        estado: true,
      },
    });

    if (!sucursal) {
      throw new BadRequestException(
        'La sucursal no pertenece al restaurante indicado o está inactiva',
      );
    }

    return sucursal;
  }

  private async buscarUsuarioDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id,
        ...this.obtenerFiltroAlcance(usuarioActual),
      },

      select: {
        id: true,
        email: true,
        activo: true,
        rolId: true,
        restauranteId: true,
        sucursalId: true,
        perfilCartaId: true,
        turnoOperativoActivoId: true,
        turnosOperativos: { select: { turnoOperativoId: true } },

        rol: {
          select: {
            nombre: true,
          },
        },
        rolesAsignados: {
          select: { rolId: true },
          orderBy: { creadoEn: 'asc' },
        },
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  async create(
    createUsuarioDto: CreateUsuarioDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const {
      password,
      email,
      rolId,
      rolIds,
      restauranteId,
      sucursalId,
      perfilCartaId,
      turnoOperativoIds,
      turnoOperativoActivoId,
      ...datosPersonales
    } = createUsuarioDto;

    const emailNormalizado = email.trim().toLowerCase();

    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: {
        email: emailNormalizado,
      },
    });

    if (usuarioExistente) {
      throw new ConflictException('Este correo electrónico ya está registrado');
    }

    let restauranteDestino: number | null;
    let sucursalDestino: number | null;

    // SUPERADMIN SIGR.
    if (usuarioActual.restauranteId === null) {
      restauranteDestino = restauranteId ?? null;

      sucursalDestino = sucursalId ?? null;
    } else {
      // Un administrador de restaurante jamás
      // puede crear usuarios en otra empresa.
      if (
        restauranteId !== undefined &&
        restauranteId !== usuarioActual.restauranteId
      ) {
        throw new ForbiddenException(
          'No puedes crear usuarios para otro restaurante',
        );
      }

      restauranteDestino = usuarioActual.restauranteId;

      // Administrador limitado a sucursal.
      if (usuarioActual.sucursalId !== null) {
        if (
          sucursalId !== undefined &&
          sucursalId !== usuarioActual.sucursalId
        ) {
          throw new ForbiddenException(
            'No puedes crear usuarios para otra sucursal',
          );
        }

        sucursalDestino = usuarioActual.sucursalId;
      } else {
        sucursalDestino = sucursalId ?? null;
      }
    }

    if (restauranteDestino !== null) {
      await this.validarRestaurante(restauranteDestino);
    }

    if (sucursalDestino !== null) {
      if (restauranteDestino === null) {
        throw new BadRequestException(
          'No se puede asignar una sucursal sin restaurante',
        );
      }

      await this.validarSucursal(sucursalDestino, restauranteDestino);
    }

    const perfilCartaDestino = await this.validarPerfilCartaOperativa(
      perfilCartaId,
      sucursalDestino,
    );
    const turnosDestino =
      (await this.validarTurnosOperativos(turnoOperativoIds, sucursalDestino)) ?? [];
    const turnoActivoDestino =
      turnoOperativoActivoId !== undefined && turnoOperativoActivoId !== null
        ? turnoOperativoActivoId
        : turnosDestino[0] ?? null;
    if (turnoActivoDestino !== null && !turnosDestino.includes(turnoActivoDestino)) {
      throw new BadRequestException('El turno activo debe estar entre los turnos permitidos del usuario');
    }

    const rolesDestino = this.normalizarRolIds(rolId, rolIds);
    await this.validarRolesParaDestino(
      rolesDestino,
      restauranteDestino,
      usuarioActual,
    );
    const rolPrincipalId =
      rolId !== undefined && rolesDestino.includes(rolId)
        ? rolId
        : rolesDestino[0];

    const passwordHasheada = await bcrypt.hash(password, 10);

    return this.prisma.transaccionSerializable(async (tx) => {
      const creado = await tx.usuario.create({
        data: {
          ...datosPersonales,
          email: emailNormalizado,
          password: passwordHasheada,
          rolId: rolPrincipalId,
          restauranteId: restauranteDestino,
          sucursalId: sucursalDestino,
          perfilCartaId: perfilCartaDestino,
          turnoOperativoActivoId: turnoActivoDestino,
          ...(turnosDestino.length
            ? { turnosOperativos: { create: turnosDestino.map((turnoOperativoId) => ({ turnoOperativoId })) } }
            : {}),
          rolesAsignados: {
            create: rolesDestino.map((rolAsignadoId) => ({
              rolId: rolAsignadoId,
            })),
          },
        },
        select: this.usuarioPublicoSelect,
      });
      await this.sync.encolarUsuario(tx, creado.id);
      return creado;
    });
  }

  findAll(usuarioActual: UsuarioAutenticado) {
    return this.prisma.usuario.findMany({
      where: this.obtenerFiltroAlcance(usuarioActual),

      select: this.usuarioPublicoSelect,

      orderBy: {
        id: 'asc',
      },
    });
  }

  async findOne(id: number, usuarioActual: UsuarioAutenticado) {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id,
        ...this.obtenerFiltroAlcance(usuarioActual),
      },

      select: this.usuarioPublicoSelect,
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  async update(
    id: number,
    updateUsuarioDto: UpdateUsuarioDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const usuarioObjetivo = await this.buscarUsuarioDentroDelAlcance(
      id,
      usuarioActual,
    );

    if (id === usuarioActual.id && updateUsuarioDto.activo === false) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    let restauranteDestino = usuarioObjetivo.restauranteId;

    let sucursalDestino = usuarioObjetivo.sucursalId;

    // SUPERADMIN SIGR.
    if (usuarioActual.restauranteId === null) {
      if (updateUsuarioDto.restauranteId !== undefined) {
        restauranteDestino = updateUsuarioDto.restauranteId;

        // Si cambia de restaurante y no se indicó
        // sucursal, quitamos la sucursal anterior.
        if (
          restauranteDestino !== usuarioObjetivo.restauranteId &&
          updateUsuarioDto.sucursalId === undefined
        ) {
          sucursalDestino = null;
        }
      }

      if (updateUsuarioDto.sucursalId !== undefined) {
        sucursalDestino = updateUsuarioDto.sucursalId;
      }
    } else {
      // Un administrador de restaurante no puede
      // mover usuarios a otra empresa.
      if (
        updateUsuarioDto.restauranteId !== undefined &&
        updateUsuarioDto.restauranteId !== usuarioActual.restauranteId
      ) {
        throw new ForbiddenException(
          'No puedes mover usuarios a otro restaurante',
        );
      }

      restauranteDestino = usuarioActual.restauranteId;

      if (usuarioActual.sucursalId !== null) {
        if (
          updateUsuarioDto.sucursalId !== undefined &&
          updateUsuarioDto.sucursalId !== usuarioActual.sucursalId
        ) {
          throw new ForbiddenException(
            'No puedes mover usuarios a otra sucursal',
          );
        }

        sucursalDestino = usuarioActual.sucursalId;
      } else if (updateUsuarioDto.sucursalId !== undefined) {
        sucursalDestino = updateUsuarioDto.sucursalId;
      }
    }

    if (restauranteDestino !== null) {
      await this.validarRestaurante(restauranteDestino);
    }

    if (sucursalDestino !== null) {
      if (restauranteDestino === null) {
        throw new BadRequestException(
          'No se puede asignar una sucursal sin restaurante',
        );
      }

      await this.validarSucursal(sucursalDestino, restauranteDestino);
    }

    const perfilCartaDestino =
      updateUsuarioDto.perfilCartaId === undefined
        ? usuarioObjetivo.perfilCartaId
        : await this.validarPerfilCartaOperativa(
            updateUsuarioDto.perfilCartaId,
            sucursalDestino,
          );

    if (
      perfilCartaDestino !== null &&
      sucursalDestino !== usuarioObjetivo.sucursalId &&
      updateUsuarioDto.perfilCartaId === undefined
    ) {
      throw new BadRequestException(
        'Al mover el usuario de sucursal debes seleccionar nuevamente su turno operativo',
      );
    }

    const turnosActuales = usuarioObjetivo.turnosOperativos.map((item) => item.turnoOperativoId);
    const turnosDestino =
      (await this.validarTurnosOperativos(
        updateUsuarioDto.turnoOperativoIds,
        sucursalDestino,
      )) ?? turnosActuales;
    if (
      sucursalDestino !== usuarioObjetivo.sucursalId &&
      updateUsuarioDto.turnoOperativoIds === undefined &&
      turnosActuales.length
    ) {
      throw new BadRequestException(
        'Al mover el usuario de sucursal debes seleccionar nuevamente sus turnos operativos',
      );
    }
    let turnoActivoDestino =
      updateUsuarioDto.turnoOperativoActivoId === undefined
        ? usuarioObjetivo.turnoOperativoActivoId
        : updateUsuarioDto.turnoOperativoActivoId;
    if (turnoActivoDestino !== null && !turnosDestino.includes(turnoActivoDestino)) {
      turnoActivoDestino = turnosDestino[0] ?? null;
    }

    const rolesActuales = usuarioObjetivo.rolesAsignados.length
      ? usuarioObjetivo.rolesAsignados.map((item) => item.rolId)
      : [usuarioObjetivo.rolId];
    const rolesDestino = this.normalizarRolIds(
      updateUsuarioDto.rolId,
      updateUsuarioDto.rolIds,
      rolesActuales,
    );
    await this.validarRolesParaDestino(
      rolesDestino,
      restauranteDestino,
      usuarioActual,
    );
    const rolPrincipalId =
      updateUsuarioDto.rolId !== undefined &&
      rolesDestino.includes(updateUsuarioDto.rolId)
        ? updateUsuarioDto.rolId
        : rolesDestino.includes(usuarioObjetivo.rolId)
          ? usuarioObjetivo.rolId
          : rolesDestino[0];

    let emailNormalizado: string | undefined;

    if (updateUsuarioDto.email !== undefined) {
      emailNormalizado = updateUsuarioDto.email.trim().toLowerCase();

      if (emailNormalizado !== usuarioObjetivo.email) {
        const emailExistente = await this.prisma.usuario.findUnique({
          where: {
            email: emailNormalizado,
          },
        });

        if (emailExistente) {
          throw new ConflictException(
            'Este correo electrónico ya está registrado',
          );
        }
      }
    }

    let passwordHasheada: string | undefined;

    if (updateUsuarioDto.password !== undefined) {
      passwordHasheada = await bcrypt.hash(updateUsuarioDto.password, 10);
    }

    const {
      password: _password,
      restauranteId: _restauranteId,
      sucursalId: _sucursalId,
      perfilCartaId: _perfilCartaId,
      turnoOperativoIds: _turnoOperativoIds,
      turnoOperativoActivoId: _turnoOperativoActivoId,
      rolIds: _rolIds,
      email: _email,
      ...datosActualizables
    } = updateUsuarioDto;
    void _password;
    void _restauranteId;
    void _sucursalId;
    void _perfilCartaId;
    void _turnoOperativoIds;
    void _turnoOperativoActivoId;
    void _rolIds;
    void _email;

    return this.prisma.transaccionSerializable(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          ...datosActualizables,
          ...(emailNormalizado !== undefined
            ? { email: emailNormalizado }
            : {}),
          ...(passwordHasheada !== undefined
            ? { password: passwordHasheada }
            : {}),
          rolId: rolPrincipalId,
          restauranteId: restauranteDestino,
          sucursalId: sucursalDestino,
          perfilCartaId: perfilCartaDestino,
          turnoOperativoActivoId: turnoActivoDestino,
        },
      });
      if (updateUsuarioDto.turnoOperativoIds !== undefined) {
        await tx.usuarioTurnoOperativo.deleteMany({ where: { usuarioId: id } });
        if (turnosDestino.length) {
          await tx.usuarioTurnoOperativo.createMany({
            data: turnosDestino.map((turnoOperativoId) => ({ usuarioId: id, turnoOperativoId })),
          });
        }
      }
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioRol.createMany({
        data: rolesDestino.map((rolAsignadoId) => ({
          usuarioId: id,
          rolId: rolAsignadoId,
        })),
      });
      await this.sync.encolarUsuario(tx, id);
      return tx.usuario.findUniqueOrThrow({
        where: { id },
        select: this.usuarioPublicoSelect,
      });
    });
  }

  async misTurnosOperativos(usuarioActual: UsuarioAutenticado) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioActual.id },
      select: {
        turnoOperativoActivoId: true,
        turnosOperativos: {
          where: { turnoOperativo: { estado: true } },
          select: { turnoOperativo: { select: { id: true, nombre: true, orden: true } } },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    const turnos = usuario.turnosOperativos
      .map((item) => item.turnoOperativo)
      .sort((a, b) => a.orden - b.orden || a.id - b.id);
    return {
      turnoOperativoActivoId: usuario.turnoOperativoActivoId,
      turnos,
    };
  }

  async cambiarMiTurnoOperativo(turnoOperativoId: number, usuarioActual: UsuarioAutenticado) {
    const permitido = await this.prisma.usuarioTurnoOperativo.findFirst({
      where: {
        usuarioId: usuarioActual.id,
        turnoOperativoId,
        turnoOperativo: { estado: true },
      },
      include: { turnoOperativo: true },
    });
    if (!permitido) {
      throw new ForbiddenException('Ese turno no está habilitado para tu usuario');
    }
    await this.prisma.usuario.update({
      where: { id: usuarioActual.id },
      data: { turnoOperativoActivoId: turnoOperativoId },
    });
    return {
      turnoOperativoActivoId: turnoOperativoId,
      turnoOperativoActivo: permitido.turnoOperativo,
    };
  }

  async remove(id: number, usuarioActual: UsuarioAutenticado) {
    if (id === usuarioActual.id) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    await this.buscarUsuarioDentroDelAlcance(id, usuarioActual);

    return this.prisma.transaccionSerializable(async (tx) => {
      const actualizado = await tx.usuario.update({
        where: { id },
        data: { activo: false },
        select: this.usuarioPublicoSelect,
      });
      await this.sync.encolarUsuario(tx, actualizado.id);
      return actualizado;
    });
  }
}
