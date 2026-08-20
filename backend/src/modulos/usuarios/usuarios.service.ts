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

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly usuarioPublicoSelect = {
    id: true,
    nombres: true,
    apellidos: true,
    email: true,
    activo: true,
    rolId: true,
    restauranteId: true,
    sucursalId: true,
    creadoEn: true,

    rol: {
      select: {
        id: true,
        nombre: true,
      },
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

        rol: {
          select: {
            nombre: true,
          },
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
      restauranteId,
      sucursalId,
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

    // El rol se valida cuando ya conocemos
    // el restaurante final del nuevo usuario.
    await this.validarRolParaDestino(rolId, restauranteDestino, usuarioActual);

    const passwordHasheada = await bcrypt.hash(password, 10);

    return this.prisma.usuario.create({
      data: {
        ...datosPersonales,

        email: emailNormalizado,
        password: passwordHasheada,

        rolId,

        restauranteId: restauranteDestino,

        sucursalId: sucursalDestino,
      },

      select: this.usuarioPublicoSelect,
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

    // Si no se cambia el rol, validamos el rol actual
    // contra el restaurante final.
    //
    // Esto evita mover un usuario de restaurante
    // conservando accidentalmente un rol del tenant anterior.
    const rolDestino = updateUsuarioDto.rolId ?? usuarioObjetivo.rolId;

    await this.validarRolParaDestino(
      rolDestino,
      restauranteDestino,
      usuarioActual,
    );

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
      email: _email,
      ...datosActualizables
    } = updateUsuarioDto;
    void _password;
    void _restauranteId;
    void _sucursalId;
    void _email;

    return this.prisma.usuario.update({
      where: {
        id,
      },

      data: {
        ...datosActualizables,

        ...(emailNormalizado !== undefined
          ? {
              email: emailNormalizado,
            }
          : {}),

        ...(passwordHasheada !== undefined
          ? {
              password: passwordHasheada,
            }
          : {}),

        restauranteId: restauranteDestino,

        sucursalId: sucursalDestino,
      },

      select: this.usuarioPublicoSelect,
    });
  }

  async remove(id: number, usuarioActual: UsuarioAutenticado) {
    if (id === usuarioActual.id) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    await this.buscarUsuarioDentroDelAlcance(id, usuarioActual);

    return this.prisma.usuario.update({
      where: {
        id,
      },

      data: {
        activo: false,
      },

      select: this.usuarioPublicoSelect,
    });
  }
}
