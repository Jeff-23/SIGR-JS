import { Injectable, ConflictException } from '@nestjs/common';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsuariosService {
  // Inyectamos Prisma para poder hablar con la base de datos
  constructor(private readonly prisma: PrismaService) {}

  async create(createUsuarioDto: CreateUsuarioDto) {
    const { password, email, ...userData } = createUsuarioDto;

    // 1. Verificar si el correo ya existe en el sistema
    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { email },
    });

    if (usuarioExistente) {
      throw new ConflictException('Este correo electrónico ya está registrado.');
    }

    // 2. Encriptar la contraseña (nadie podrá verla, ni siquiera los administradores)
    const saltos = 10;
    const passwordHasheada = await bcrypt.hash(password, saltos);

    // 3. Guardar el nuevo usuario en la base de datos
    const nuevoUsuario = await this.prisma.usuario.create({
      data: {
        ...userData,
        email,
        password: passwordHasheada,
      },
    });

    // 4. Retornar los datos del usuario, pero ELIMINANDO la contraseña por seguridad
    const { password: _, ...usuarioSinPassword } = nuevoUsuario;
    return usuarioSinPassword;
  }

  findAll() {
    return this.prisma.usuario.findMany({
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        email: true,
        activo: true,
        rolId: true,
        sucursalId: true,
      }
    });
  }

  findOne(id: number) {
    return this.prisma.usuario.findUnique({
      where: { id },
    });
  }

  update(id: number, updateUsuarioDto: UpdateUsuarioDto) {
    return `This action updates a #${id} usuario`;
  }

  remove(id: number) {
    return `This action removes a #${id} usuario`;
  }
}