import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import { obtenerEntorno } from '../../config/entorno';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: obtenerEntorno().jwtSecret,
    });
  }

  async validate(payload: { sub: number }) {
    const usuario = await this.prisma.usuario.findUnique({
      where: {
        id: payload.sub,
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

            permisos: {
              where: {
                permiso: {
                  activo: true,
                },
              },

              select: {
                permiso: {
                  select: {
                    codigo: true,
                  },
                },
              },
            },
          },
        },

        restaurante: {
          select: {
            estado: true,

            plan: {
              select: {
                activo: true,

                capacidades: {
                  where: {
                    capacidad: {
                      activo: true,
                    },
                  },

                  select: {
                    capacidad: {
                      select: {
                        codigo: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },

        sucursal: {
          select: {
            estado: true,
            restauranteId: true,
          },
        },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'La sesión no es válida o el usuario está inactivo',
      );
    }

    if (
      usuario.restauranteId !== null &&
      (!usuario.restaurante || !usuario.restaurante.estado)
    ) {
      throw new UnauthorizedException(
        'La sesión no es válida para un restaurante activo',
      );
    }

    if (
      usuario.sucursalId !== null &&
      (!usuario.sucursal ||
        !usuario.sucursal.estado ||
        usuario.sucursal.restauranteId !== usuario.restauranteId)
    ) {
      throw new UnauthorizedException(
        'La sesión no es válida para una sucursal activa',
      );
    }

    return {
      id: usuario.id,
      email: usuario.email,

      rolId: usuario.rolId,
      rol: usuario.rol.nombre,

      restauranteId: usuario.restauranteId,

      sucursalId: usuario.sucursalId,

      permisos: usuario.rol.permisos.map(
        (rolPermiso) => rolPermiso.permiso.codigo,
      ),
      capacidades: usuario.restaurante?.plan?.activo
        ? usuario.restaurante.plan.capacidades.map(
            (planCapacidad) => planCapacidad.capacidad.codigo,
          )
        : [],
    };
  }
}
