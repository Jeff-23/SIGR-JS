import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

import { CrearClienteDto } from './dto/crear-cliente.dto';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto';
import { CambiarEstadoClienteDto } from './dto/cambiar-estado-cliente.dto';
import { ListarClientesDto } from './dto/listar-clientes.dto';
import { respuestaPaginada } from '../../plataforma/paginacion';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private filtroAlcance(
    usuarioActual: UsuarioAutenticado,
  ): Prisma.ClienteWhereInput {
    if (this.esSuperadmin(usuarioActual)) {
      return {};
    }

    if (usuarioActual.restauranteId === null) {
      throw new ForbiddenException(
        'El usuario no tiene un restaurante asignado',
      );
    }

    return {
      restauranteId: usuarioActual.restauranteId,
    };
  }

  private obtenerRestauranteParaCreacion(usuarioActual: UsuarioAutenticado) {
    if (
      this.esSuperadmin(usuarioActual) ||
      usuarioActual.restauranteId === null
    ) {
      throw new ForbiddenException(
        'La creación de clientes requiere contexto de restaurante',
      );
    }

    return usuarioActual.restauranteId;
  }

  private normalizarTextoOpcional(valor: string | null | undefined) {
    if (valor === undefined || valor === null) {
      return null;
    }

    const limpio = valor.trim();

    return limpio.length > 0 ? limpio : null;
  }

  private normalizarDocumento(valor: string | null | undefined) {
    const limpio = this.normalizarTextoOpcional(valor);

    return limpio ? limpio.toUpperCase() : null;
  }

  private normalizarCorreo(valor: string | null | undefined) {
    const limpio = this.normalizarTextoOpcional(valor);

    return limpio ? limpio.toLowerCase() : null;
  }

  private normalizarFechaNacimiento(valor: string | null | undefined) {
    if (valor === undefined || valor === null) {
      return null;
    }

    const fecha = new Date(valor);

    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }

    if (fecha.getTime() > Date.now()) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede estar en el futuro',
      );
    }

    return fecha;
  }

  private async validarDocumentoDisponible(
    restauranteId: number,
    numeroDocumento: string | null,
    clienteIdExcluir?: number,
  ) {
    if (!numeroDocumento) {
      return;
    }

    const existente = await this.prisma.cliente.findFirst({
      where: {
        restauranteId,
        numeroDocumento,

        ...(clienteIdExcluir !== undefined
          ? {
              id: {
                not: clienteIdExcluir,
              },
            }
          : {}),
      },

      select: {
        id: true,
      },
    });

    if (existente) {
      throw new ConflictException(
        'Ya existe un cliente con ese documento en el restaurante',
      );
    }
  }

  private async buscarDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        id,
        ...this.filtroAlcance(usuarioActual),
      },

      select: {
        id: true,
        restauranteId: true,
        tipoDocumento: true,
        numeroDocumento: true,
        nombres: true,
        apellidos: true,
        telefono: true,
        correo: true,
        direccion: true,
        fechaNacimiento: true,
        estado: true,
        creadoEn: true,
        actualizadoEn: true,

        restaurante: {
          select: {
            id: true,
            nombre: true,
          },
        },

        _count: {
          select: {
            ventas: true,
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return cliente;
  }

  async crear(data: CrearClienteDto, usuarioActual: UsuarioAutenticado) {
    const restauranteId = this.obtenerRestauranteParaCreacion(usuarioActual);

    const restaurante = await this.prisma.restaurante.findFirst({
      where: {
        id: restauranteId,
        estado: true,
      },

      select: {
        id: true,
      },
    });

    if (!restaurante) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const nombres = data.nombres.trim();

    if (!nombres) {
      throw new BadRequestException('Los nombres del cliente son obligatorios');
    }

    const numeroDocumento = this.normalizarDocumento(data.numeroDocumento);

    await this.validarDocumentoDisponible(restauranteId, numeroDocumento);

    return this.prisma.cliente.create({
      data: {
        restauranteId,

        tipoDocumento: this.normalizarDocumento(data.tipoDocumento),

        numeroDocumento,
        nombres,

        apellidos: this.normalizarTextoOpcional(data.apellidos),

        telefono: this.normalizarTextoOpcional(data.telefono),

        correo: this.normalizarCorreo(data.correo),

        direccion: this.normalizarTextoOpcional(data.direccion),

        fechaNacimiento: this.normalizarFechaNacimiento(data.fechaNacimiento),
      },
    });
  }

  async listar(filtros: ListarClientesDto, usuarioActual: UsuarioAutenticado) {
    const pagina = filtros.pagina ?? 1;
    const limite = filtros.limite ?? 20;
    const buscar = filtros.buscar?.trim() ?? '';

    const where: Prisma.ClienteWhereInput = {
      ...this.filtroAlcance(usuarioActual),

      estado: filtros.estado ?? true,

      ...(buscar
        ? {
            OR: [
              {
                nombres: {
                  contains: buscar,
                  mode: 'insensitive',
                },
              },
              {
                apellidos: {
                  contains: buscar,
                  mode: 'insensitive',
                },
              },
              {
                numeroDocumento: {
                  contains: buscar.toUpperCase(),
                  mode: 'insensitive',
                },
              },
              {
                correo: {
                  contains: buscar,
                  mode: 'insensitive',
                },
              },
              {
                telefono: {
                  contains: buscar,
                },
              },
            ],
          }
        : {}),
    };

    const [datos, total] = await this.prisma.$transaction([
      this.prisma.cliente.findMany({
        where,

        select: {
          id: true,
          restauranteId: true,
          tipoDocumento: true,
          numeroDocumento: true,
          nombres: true,
          apellidos: true,
          telefono: true,
          correo: true,
          direccion: true,
          fechaNacimiento: true,
          estado: true,
          creadoEn: true,
          actualizadoEn: true,

          _count: {
            select: {
              ventas: true,
            },
          },
        },

        orderBy: [
          {
            nombres: 'asc',
          },
          {
            apellidos: 'asc',
          },
          {
            id: 'asc',
          },
        ],

        skip: (pagina - 1) * limite,

        take: limite,
      }),

      this.prisma.cliente.count({
        where,
      }),
    ]);

    return respuestaPaginada(datos, total, pagina, limite);
  }

  obtenerPorId(id: number, usuarioActual: UsuarioAutenticado) {
    return this.buscarDentroDelAlcance(id, usuarioActual);
  }

  async actualizar(
    id: number,
    data: ActualizarClienteDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const cliente = await this.buscarDentroDelAlcance(id, usuarioActual);

    const cambios: Prisma.ClienteUpdateInput = {};

    if (data.nombres !== undefined) {
      const nombres = data.nombres.trim();

      if (!nombres) {
        throw new BadRequestException(
          'Los nombres del cliente son obligatorios',
        );
      }

      cambios.nombres = nombres;
    }

    if (data.tipoDocumento !== undefined) {
      cambios.tipoDocumento = this.normalizarDocumento(data.tipoDocumento);
    }

    if (data.numeroDocumento !== undefined) {
      const numeroDocumento = this.normalizarDocumento(data.numeroDocumento);

      await this.validarDocumentoDisponible(
        cliente.restauranteId,
        numeroDocumento,
        id,
      );

      cambios.numeroDocumento = numeroDocumento;
    }

    if (data.apellidos !== undefined) {
      cambios.apellidos = this.normalizarTextoOpcional(data.apellidos);
    }

    if (data.telefono !== undefined) {
      cambios.telefono = this.normalizarTextoOpcional(data.telefono);
    }

    if (data.correo !== undefined) {
      cambios.correo = this.normalizarCorreo(data.correo);
    }

    if (data.direccion !== undefined) {
      cambios.direccion = this.normalizarTextoOpcional(data.direccion);
    }

    if (data.fechaNacimiento !== undefined) {
      cambios.fechaNacimiento = this.normalizarFechaNacimiento(
        data.fechaNacimiento,
      );
    }

    try {
      return await this.prisma.cliente.update({
        where: {
          id,
        },

        data: cambios,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un cliente con ese documento en el restaurante',
        );
      }

      throw error;
    }
  }

  async cambiarEstado(
    id: number,
    data: CambiarEstadoClienteDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.buscarDentroDelAlcance(id, usuarioActual);

    return this.prisma.cliente.update({
      where: {
        id,
      },

      data: {
        estado: data.estado,
      },
    });
  }
}
