import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import 'dotenv/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // Le decimos que busque el token en la cabecera HTTP 'Authorization: Bearer <token>'
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET, // Usamos la misma llave secreta de tu .env
    });
  }

  // Si el token es válido y la firma coincide, NestJS ejecuta esta función
  async validate(payload: any) {
    return { id: payload.sub, email: payload.email, rolId: payload.rolId };
  }
}