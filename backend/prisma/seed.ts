import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  console.log('Iniciando sembrado (Seed) con el motor de NestJS...');
  
  // Levantamos el contexto de NestJS sin el servidor HTTP
  const app = await NestFactory.createApplicationContext(AppModule);
  // Extraemos tu PrismaService ya configurado
  const prisma = app.get(PrismaService);

  try {
    // 1. Asegurar que el Rol ADMIN existe
    const rolAdmin = await prisma.rol.upsert({
      where: { nombre: 'ADMIN' },
      update: {},
      create: {
        nombre: 'ADMIN',
        descripcion: 'Administrador maestro del sistema SIGR',
      },
    });
    console.log('Rol ADMIN configurado.');

    // 2. Crear el Usuario Super Administrador con contraseña encriptada
    const saltos = 10;
    const passwordHasheada = await bcrypt.hash('PasswordSeguro123!', saltos);

    const admin = await prisma.usuario.upsert({
      where: { email: 'admin@sigr.com' },
      update: {},
      create: {
        nombres: 'Super',
        apellidos: 'Administrador',
        email: 'admin@sigr.com',
        password: passwordHasheada,
        rolId: rolAdmin.id,
      },
    });
    console.log(`Super Administrador creado con email: ${admin.email}`);
  } catch (error) {
    console.error('Error ejecutando el seed:', error);
  } finally {
    // Apagamos la conexión limpiamente
    await app.close();
  }
}

bootstrap();