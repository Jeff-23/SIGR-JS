import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
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
          },
        },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'La sesión no es válida o el usuario está inactivo',
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