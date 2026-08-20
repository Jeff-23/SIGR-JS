import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { obtenerEntorno } from './config/entorno';

async function bootstrap() {
  const entorno = obtenerEntorno();
  const app = await NestFactory.create(AppModule);

  // CONFIGURACIÓN CORS ESTRICTA (SEGURIDAD PROFESIONAL)
  // Solo permitimos peticiones provenientes del puerto 5173 (Nuestro React)
  app.enableCors({
    origin: entorno.corsOrigenes,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(entorno.puerto);
}
void bootstrap();
