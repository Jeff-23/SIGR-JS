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
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: {
        rol: {
          include: {
            permisos: {
              where: { permiso: { activo: true } },
              include: { permiso: true },
            },
          },
        },
        rolesAsignados: {
          include: {
            rol: {
              include: {
                permisos: {
                  where: { permiso: { activo: true } },
                  include: { permiso: true },
                },
              },
            },
          },
        },
        restaurante: {
          include: {
            plan: {
              include: {
                capacidades: {
                  where: { capacidad: { activo: true } },
                  include: { capacidad: true },
                },
              },
            },
          },
        },
        sucursal: { select: { nombre: true } },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const rolesAsignados = usuario.rolesAsignados.length
      ? usuario.rolesAsignados.map((item) => item.rol)
      : [usuario.rol];
    const roles = [...new Set(rolesAsignados.map((rol) => rol.nombre))];
    const permisos = [
      ...new Set(
        rolesAsignados.flatMap((rol) =>
          rol.permisos.map((rolPermiso) => rolPermiso.permiso.codigo),
        ),
      ),
    ];

    const payload = { sub: usuario.id };
    const token = this.jwtService.sign(payload);
    return {
      mensaje: 'Autenticación exitosa',
      usuario: {
        id: usuario.id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        email: usuario.email,
        restauranteId: usuario.restauranteId,
        sucursalId: usuario.sucursalId,
      },
      sesion: {
        id: usuario.id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        email: usuario.email,
        rol: usuario.rol.nombre,
        roles,
        restauranteId: usuario.restauranteId,
        sucursalId: usuario.sucursalId,
        permisos,
        capacidades: usuario.restaurante?.plan?.activo
          ? usuario.restaurante.plan.capacidades.map(
              (planCapacidad) => planCapacidad.capacidad.codigo,
            )
          : [],
        restauranteNombre: usuario.restaurante?.nombre,
        sucursalNombre: usuario.sucursal?.nombre,
      },
      token,
    };
  }
}
