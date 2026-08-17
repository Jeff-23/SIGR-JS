import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
} from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
) {
  constructor(
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest:
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: number }) {
    const usuario =
      await this.prisma.usuario.findUnique({
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
            },
          },

          restaurante: {
            select: {
              estado: true,
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

    // El usuario debe existir y estar activo.
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'La sesión no es válida o el usuario está inactivo',
      );
    }

    // Si pertenece a un restaurante,
    // este debe existir y estar activo.
    if (
      usuario.restauranteId !== null &&
      (
        !usuario.restaurante ||
        !usuario.restaurante.estado
      )
    ) {
      throw new UnauthorizedException(
        'La sesión no es válida para un restaurante activo',
      );
    }

    // Si pertenece a una sucursal,
    // esta debe estar activa y pertenecer
    // al mismo restaurante del usuario.
    if (
      usuario.sucursalId !== null &&
      (
        !usuario.sucursal ||
        !usuario.sucursal.estado ||
        usuario.sucursal.restauranteId !==
          usuario.restauranteId
      )
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
    };
  }
}