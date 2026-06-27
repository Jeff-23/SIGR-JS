import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // 1. Buscamos al usuario en la base de datos
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
    });

    // 2. Si no existe, devolvemos un error genérico (Regla de oro anti-hackers: nunca revelar si el correo existe o no)
    if (!usuario) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 3. Comparamos la contraseña enviada con la contraseña encriptada guardada
    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 4. Creamos el "Carnet Digital" (Token) con la info clave del usuario
    const payload = { sub: usuario.id, email: usuario.email, rolId: usuario.rolId };
    const token = this.jwtService.sign(payload);

    // 5. Ocultamos la contraseña antes de responderle al frontend
    const { password: _, ...usuarioLimpio } = usuario;
    
    return {
      mensaje: 'Autenticación exitosa',
      usuario: usuarioLimpio,
      token, // <- ¡Esta es la llave de acceso para todas las rutas futuras!
    };
  }
}