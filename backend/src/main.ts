import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { obtenerEntorno } from './config/entorno';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const entorno = obtenerEntorno();
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  if (entorno.confianzaProxy) {
    const servidor = app.getHttpAdapter().getInstance() as {
      set(nombre: string, valor: number): void;
    };
    servidor.set('trust proxy', 1);
  }

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

  if (entorno.swaggerHabilitado) {
    const configuracion = new DocumentBuilder()
      .setTitle('SIGR V2 Backend API')
      .setDescription(
        'API multiempresa y multisucursal. Pedido, Venta, Pago, Factura y Documento Electrónico son recursos independientes.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'Idempotency-Key' },
        'idempotency',
      )
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, configuracion),
    );
  }

  app.enableShutdownHooks();
  await app.listen(entorno.puerto, '0.0.0.0');
}
void bootstrap();
