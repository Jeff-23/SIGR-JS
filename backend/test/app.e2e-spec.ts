import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('propaga una correlación válida en la respuesta', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/')
      .set('x-request-id', 'sigr-prueba-001')
      .expect(200);

    expect(respuesta.headers['x-request-id']).toBe('sigr-prueba-001');
  });

  it('normaliza errores sin exponer detalles internos', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/ruta-inexistente')
      .expect(404);
    const cuerpo = respuesta.body as Record<string, unknown>;

    expect(respuesta.headers['x-request-id']).toBeDefined();
    expect(cuerpo).toEqual(
      expect.objectContaining({
        statusCode: 404,
        path: '/ruta-inexistente',
        requestId: respuesta.headers['x-request-id'],
      }),
    );
    expect(cuerpo.timestamp).toEqual(expect.any(String));
  });

  it('distingue vida del proceso y disponibilidad de base de datos', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect(
        ({ body }: { body: { status: string; uptimeSeconds: number } }) => {
          expect(body.status).toBe('ok');
          expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
        },
      );

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'available' });

    await request(app.getHttpServer())
      .get('/health/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect((respuesta) => {
        expect(respuesta.text).toContain('sigr_http_requests_total');
        expect(respuesta.text).not.toContain('restauranteId');
        expect(respuesta.text).not.toContain('sucursalId');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
