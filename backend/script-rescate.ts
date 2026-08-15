import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

async function main() {
  console.log('🚀 Iniciando contexto de NestJS para rescate...');
  
  // 1. Cargamos el contexto de la App (Lee el .env, pero no usa el puerto 3000)
  const app = await NestFactory.createApplicationContext(AppModule);
  
  // 2. Extraemos nuestra instancia oficial de Prisma
  const prisma = app.get(PrismaService);

  console.log('⏳ Inyectando cuenta de administrador...');
  
  try {
    const hashPassword = await bcrypt.hash('password123', 10);

    const nuevoAdmin = await prisma.usuario.create({
      data: {
        nombres: 'Admin',
        apellidos: 'Principal',
        email: 'admin2@restaurante.com',
        password: hashPassword,
        rolId: 1,      
        sucursalId: 1  
      },
    });

    console.log('✅ ¡Éxito! Usuario creado de forma segura saltando la API.');
    console.log(`📧 Email: ${nuevoAdmin.email}`);
    console.log(`🔑 Clave: password123`);
  } catch (error) {
    console.error('❌ Error inyectando el usuario (¿Quizás ya existe?):', error);
  } finally {
    // 3. Apagamos el contexto y desconectamos la BD limpiamente
    await app.close();
    process.exit(0);
  }
}

main();