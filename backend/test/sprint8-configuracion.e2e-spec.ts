import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AmbitoRol } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('SPRINT 8 | Configuracion multiempresa y multisucursal (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const restauranteIds: number[] = [];
  const sucursalIds: number[] = [];
  const rolIds: number[] = [];
  const usuarioIds: number[] = [];
  let tokenA = '';
  let tokenB = '';
  let tokenSucursalA = '';

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const plan = await prisma.plan.findUnique({
      where: { codigo: 'PRO' },
      select: { id: true },
    });
    if (!plan) throw new Error('El seed debe incluir el plan PRO');

    const permisos = await prisma.permiso.findMany({
      where: {
        codigo: {
          in: [
            'CONFIGURACION_VER',
            'CONFIGURACION_GESTIONAR',
            'AUDITORIA_VER',
            'CLIENTES_CREAR',
          ],
        },
        activo: true,
      },
      select: { id: true },
    });
    if (permisos.length !== 4) {
      throw new Error(
        'La migracion debe incluir los permisos de configuracion',
      );
    }

    const [restauranteA, restauranteB] = await Promise.all([
      prisma.restaurante.create({
        data: {
          nombre: `E2E S8 A ${sufijo}`,
          nit: `S8A${sufijo}`,
          planId: plan.id,
        },
      }),
      prisma.restaurante.create({
        data: {
          nombre: `E2E S8 B ${sufijo}`,
          nit: `S8B${sufijo}`,
          planId: plan.id,
        },
      }),
    ]);
    restauranteIds.push(restauranteA.id, restauranteB.id);

    const [sucursalA, sucursalA2, sucursalB] = await Promise.all([
      prisma.sucursal.create({
        data: {
          nombre: `Sucursal A ${sufijo}`,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.sucursal.create({
        data: {
          nombre: `Sucursal A2 ${sufijo}`,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.sucursal.create({
        data: {
          nombre: `Sucursal B ${sufijo}`,
          restauranteId: restauranteB.id,
        },
      }),
    ]);
    sucursalIds.push(sucursalA.id, sucursalA2.id, sucursalB.id);

    const [rolA, rolB] = await Promise.all([
      prisma.rol.create({
        data: {
          clave: `E2E:S8:A:${sufijo}`,
          nombre: `E2E_S8_A_${sufijo}`,
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.rol.create({
        data: {
          clave: `E2E:S8:B:${sufijo}`,
          nombre: `E2E_S8_B_${sufijo}`,
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restauranteB.id,
        },
      }),
    ]);
    rolIds.push(rolA.id, rolB.id);

    await prisma.rolPermiso.createMany({
      data: [rolA.id, rolB.id].flatMap((rolId) =>
        permisos.map((permiso) => ({ rolId, permisoId: permiso.id })),
      ),
    });

    const [usuarioA, usuarioB, usuarioSucursalA] = await Promise.all([
      prisma.usuario.create({
        data: {
          nombres: 'Admin',
          apellidos: 'A',
          email: `s8-a-${sufijo}@test.local`,
          password: 'no-usada',
          rolId: rolA.id,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.usuario.create({
        data: {
          nombres: 'Admin',
          apellidos: 'B',
          email: `s8-b-${sufijo}@test.local`,
          password: 'no-usada',
          rolId: rolB.id,
          restauranteId: restauranteB.id,
        },
      }),
      prisma.usuario.create({
        data: {
          nombres: 'Sucursal',
          apellidos: 'A',
          email: `s8-sa-${sufijo}@test.local`,
          password: 'no-usada',
          rolId: rolA.id,
          restauranteId: restauranteA.id,
          sucursalId: sucursalA.id,
        },
      }),
    ]);
    usuarioIds.push(usuarioA.id, usuarioB.id, usuarioSucursalA.id);
    tokenA = jwtService.sign({ sub: usuarioA.id });
    tokenB = jwtService.sign({ sub: usuarioB.id });
    tokenSucursalA = jwtService.sign({ sub: usuarioSucursalA.id });
  });

  afterAll(async () => {
    if (usuarioIds.length)
      await prisma.eventoAuditoria.deleteMany({
        where: { actorId: { in: usuarioIds } },
      });
    if (usuarioIds.length)
      await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
    if (restauranteIds.length)
      await prisma.cliente.deleteMany({
        where: { restauranteId: { in: restauranteIds } },
      });
    if (rolIds.length)
      await prisma.rol.deleteMany({ where: { id: { in: rolIds } } });
    if (sucursalIds.length)
      await prisma.sucursal.deleteMany({ where: { id: { in: sucursalIds } } });
    if (restauranteIds.length) {
      await prisma.restaurante.deleteMany({
        where: { id: { in: restauranteIds } },
      });
    }
    await app.close();
    await moduleRef.close();
  });

  it('resuelve predeterminado, restaurante y sobrescritura de sucursal', async () => {
    const sucursalAId = sucursalIds[0];

    await request(app.getHttpServer())
      .patch('/configuracion/restaurante/MONEDA')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Request-Id', `e2e-config-${sufijo}`)
      .send({ valor: 'USD' })
      .expect(200);

    let efectiva = await request(app.getHttpServer())
      .get(`/configuracion/efectiva/${sucursalAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(efectiva.body.valores.MONEDA).toBe('USD');
    expect(efectiva.body.origenes.MONEDA).toBe('RESTAURANTE');
    expect(efectiva.body.valores.ZONA_HORARIA).toBe('America/Bogota');
    expect(efectiva.body.origenes.ZONA_HORARIA).toBe('PREDETERMINADO');

    await request(app.getHttpServer())
      .patch(`/configuracion/sucursales/${sucursalAId}/MONEDA`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ valor: 'EUR' })
      .expect(200);

    efectiva = await request(app.getHttpServer())
      .get(`/configuracion/efectiva/${sucursalAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(efectiva.body.valores.MONEDA).toBe('EUR');
    expect(efectiva.body.origenes.MONEDA).toBe('SUCURSAL');
  });

  it('registra y consulta auditoria sin exponer otros restaurantes', async () => {
    const auditoriaA = await request(app.getHttpServer())
      .get('/auditoria?recurso=CONFIGURACION_RESTAURANTE')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const evento = auditoriaA.body.datos.find(
      (item: { correlacionId: string }) =>
        item.correlacionId === `e2e-config-${sufijo}`,
    );
    expect(evento).toMatchObject({
      actorId: usuarioIds[0],
      actorEmail: `s8-a-${sufijo}@test.local`,
      restauranteId: restauranteIds[0],
      accion: 'CONFIGURACION_CREADA',
      recurso: 'CONFIGURACION_RESTAURANTE',
      valoresDespues: { clave: 'MONEDA', valor: 'USD' },
    });

    const auditoriaB = await request(app.getHttpServer())
      .get('/auditoria?recurso=CONFIGURACION_RESTAURANTE')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(
      auditoriaB.body.datos.some(
        (item: { correlacionId: string }) =>
          item.correlacionId === `e2e-config-${sufijo}`,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .patch(`/auditoria/${evento.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ accion: 'ALTERADA' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/auditoria/${evento.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('audita automaticamente una mutacion preexistente', async () => {
    const cliente = await request(app.getHttpServer())
      .post('/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Request-Id', `e2e-auto-${sufijo}`)
      .send({ nombres: `Cliente auditado ${sufijo}` })
      .expect(201);

    const consulta = await request(app.getHttpServer())
      .get('/auditoria?recurso=CLIENTE')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const evento = consulta.body.datos.find(
      (item: { correlacionId: string }) =>
        item.correlacionId === `e2e-auto-${sufijo}`,
    );
    expect(evento).toMatchObject({
      accion: 'CLIENTE_POST',
      recurso: 'CLIENTE',
      recursoId: String(cliente.body.id),
      restauranteId: restauranteIds[0],
    });
    expect(evento.valoresDespues.solicitud).toEqual({
      nombres: `Cliente auditado ${sufijo}`,
    });
  });

  it('rechaza valores o claves fuera del catalogo', async () => {
    await request(app.getHttpServer())
      .patch('/configuracion/restaurante/PORCENTAJE_IMPUESTO')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ valor: 101 })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/configuracion/restaurante/SECRETO_LIBRE')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ valor: 'valor' })
      .expect(400);
  });

  it('impide atravesar restaurante o alcance de sucursal', async () => {
    await request(app.getHttpServer())
      .patch('/configuracion/restaurante/MONEDA')
      .set('Authorization', `Bearer ${tokenSucursalA}`)
      .send({ valor: 'GBP' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/configuracion/efectiva/${sucursalIds[2]}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/configuracion/efectiva/${sucursalIds[1]}`)
      .set('Authorization', `Bearer ${tokenSucursalA}`)
      .expect(403);

    const efectivaB = await request(app.getHttpServer())
      .get(`/configuracion/efectiva/${sucursalIds[2]}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(efectivaB.body.valores.MONEDA).toBe('COP');
  });
});
