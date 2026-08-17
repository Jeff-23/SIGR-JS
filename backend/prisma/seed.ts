import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  console.log('Iniciando seed de SIGR...');

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      'La variable SEED_ADMIN_PASSWORD no está configurada en backend/.env',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    // 1. Asegurar que el rol ADMIN exista.
    const rolAdmin = await prisma.rol.upsert({
      where: {
        nombre: 'ADMIN',
      },
      update: {},
      create: {
        nombre: 'ADMIN',
        descripcion: 'Administrador maestro del sistema SIGR',
      },
    });

    console.log('Rol ADMIN configurado.');

    // 2. Generar el hash de la contraseña definida por entorno.
    const passwordHasheada = await bcrypt.hash(adminPassword, 10);

    // 3. Crear o mantener el superadministrador.
    const admin = await prisma.usuario.upsert({
      where: {
        email: 'admin@sigr.com',
      },
      update: {},
      create: {
        nombres: 'Super',
        apellidos: 'Administrador',
        email: 'admin@sigr.com',
        password: passwordHasheada,
        rolId: rolAdmin.id,
      },
    });

    console.log(`Superadministrador configurado: ${admin.email}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Error ejecutando el seed de SIGR:', error);
  process.exit(1);
});