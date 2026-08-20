import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AmbitoRol } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('SPRINT 8 | Autorizacion administrable y dinamica (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const sufijo = `${Date.now().toString().slice(-8)}${Math.floor(
    Math.random() * 1000,
  )}`;
  let restauranteAId = 0;
  let restauranteBId = 0;
  let sucursalAId = 0;
  let rolAdminAId = 0;
  let rolTrabajadorAId = 0;
  let rolBId = 0;
  let usuarioAdminAId = 0;
  let usuarioTrabajadorAId = 0;
  let usuarioGlobalId = 0;
  let planTemporalId = 0;
  let tokenAdminA = '';
  let tokenTrabajadorA = '';
  let tokenGlobal = '';

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

    const [rolGlobal, permisos] = await Promise.all([
      prisma.rol.findFirst({
        where: {
          ambito: AmbitoRol.SISTEMA,
          nombre: 'SUPERADMIN',
          restauranteId: null,
        },
        select: { id: true },
      }),
      prisma.permiso.findMany({
        where: {
          codigo: {
            in: [
              'AUTORIZACION_VER',
              'AUTORIZACION_GESTIONAR',
              'CONFIGURACION_VER',
              'MESAS_VER',
            ],
          },
          activo: true,
        },
        select: { id: true, codigo: true },
      }),
    ]);
    if (!rolGlobal || permisos.length !== 4) {
      throw new Error(
        'La base debe contener SUPERADMIN y permisos del Sprint 8',
      );
    }
    const permisoPorCodigo = new Map(
      permisos.map((item) => [item.codigo, item.id]),
    );

    const planTemporal = await prisma.plan.create({
      data: { codigo: `E2E_S8_${sufijo}`, nombre: `Plan E2E S8 ${sufijo}` },
    });
    planTemporalId = planTemporal.id;

    const [restauranteA, restauranteB] = await Promise.all([
      prisma.restaurante.create({
        data: {
          nombre: `Auth A ${sufijo}`,
          nit: `AUTHA${sufijo}`,
          planId: planTemporal.id,
        },
      }),
      prisma.restaurante.create({
        data: {
          nombre: `Auth B ${sufijo}`,
          nit: `AUTHB${sufijo}`,
          planId: planTemporal.id,
        },
      }),
    ]);
    restauranteAId = restauranteA.id;
    restauranteBId = restauranteB.id;

    const sucursalA = await prisma.sucursal.create({
      data: {
        nombre: `Sucursal Auth A ${sufijo}`,
        restauranteId: restauranteA.id,
      },
    });
    sucursalAId = sucursalA.id;

    const [rolAdminA, rolTrabajadorA, rolB] = await Promise.all([
      prisma.rol.create({
        data: {
          clave: `E2E:S8:ADMIN:${sufijo}`,
          nombre: 'ADMIN',
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.rol.create({
        data: {
          clave: `E2E:S8:TRABAJADOR:${sufijo}`,
          nombre: `TRABAJADOR_${sufijo}`,
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.rol.create({
        data: {
          clave: `E2E:S8:B:${sufijo}`,
          nombre: `ROL_B_${sufijo}`,
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restauranteB.id,
        },
      }),
    ]);
    rolAdminAId = rolAdminA.id;
    rolTrabajadorAId = rolTrabajadorA.id;
    rolBId = rolB.id;

    await prisma.rolPermiso.createMany({
      data: ['AUTORIZACION_VER', 'AUTORIZACION_GESTIONAR'].map((codigo) => ({
        rolId: rolAdminA.id,
        permisoId: permisoPorCodigo.get(codigo)!,
      })),
    });

    const [adminA, trabajadorA, global] = await Promise.all([
      prisma.usuario.create({
        data: {
          nombres: 'Admin',
          apellidos: 'A',
          email: `auth-admin-${sufijo}@test.local`,
          password: 'no-usada',
          rolId: rolAdminA.id,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.usuario.create({
        data: {
          nombres: 'Trabajador',
          apellidos: 'A',
          email: `auth-worker-${sufijo}@test.local`,
          password: 'no-usada',
          rolId: rolTrabajadorA.id,
          restauranteId: restauranteA.id,
        },
      }),
      prisma.usuario.create({
        data: {
          nombres: 'Global',
          apellidos: 'E2E',
          email: `auth-global-${sufijo}@test.local`,
          password: 'no-usada',
          rolId: rolGlobal.id,
          restauranteId: null,
          sucursalId: null,
        },
      }),
    ]);
    usuarioAdminAId = adminA.id;
    usuarioTrabajadorAId = trabajadorA.id;
    usuarioGlobalId = global.id;
    tokenAdminA = jwtService.sign({ sub: adminA.id });
    tokenTrabajadorA = jwtService.sign({ sub: trabajadorA.id });
    tokenGlobal = jwtService.sign({ sub: global.id });
  });

  afterAll(async () => {
    await prisma.eventoAuditoria.deleteMany({
      where: {
        actorId: {
          in: [usuarioAdminAId, usuarioTrabajadorAId, usuarioGlobalId],
        },
      },
    });
    await prisma.usuario.deleteMany({
      where: {
        id: { in: [usuarioAdminAId, usuarioTrabajadorAId, usuarioGlobalId] },
      },
    });
    await prisma.rol.deleteMany({
      where: { id: { in: [rolAdminAId, rolTrabajadorAId, rolBId] } },
    });
    await prisma.sucursal.deleteMany({ where: { id: sucursalAId } });
    await prisma.restaurante.deleteMany({
      where: { id: { in: [restauranteAId, restauranteBId] } },
    });
    await prisma.plan.delete({ where: { id: planTemporalId } });
    await app.close();
    await moduleRef.close();
  });

  it('aplica permisos del rol dinamicamente al mismo JWT', async () => {
    await request(app.getHttpServer())
      .get('/configuracion/restaurante')
      .set('Authorization', `Bearer ${tokenTrabajadorA}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(`/autorizacion/roles/${rolTrabajadorAId}/permisos`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({ codigos: ['CONFIGURACION_VER'] })
      .expect(200);

    await request(app.getHttpServer())
      .get('/configuracion/restaurante')
      .set('Authorization', `Bearer ${tokenTrabajadorA}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`/autorizacion/roles/${rolTrabajadorAId}/permisos`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({ codigos: [] })
      .expect(200);

    await request(app.getHttpServer())
      .get('/configuracion/restaurante')
      .set('Authorization', `Bearer ${tokenTrabajadorA}`)
      .expect(403);
  });

  it('impide que un ADMIN atraviese el tenant o administre planes', async () => {
    await request(app.getHttpServer())
      .put(`/autorizacion/roles/${rolBId}/permisos`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({ codigos: ['CONFIGURACION_VER'] })
      .expect(404);

    await request(app.getHttpServer())
      .put(`/autorizacion/planes/${planTemporalId}/capacidades`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({ codigos: ['MESAS'] })
      .expect(403);
  });

  it('aplica capacidades del plan dinamicamente al mismo JWT', async () => {
    await prisma.rolPermiso.create({
      data: {
        rolId: rolTrabajadorAId,
        permisoId: (
          await prisma.permiso.findUniqueOrThrow({
            where: { codigo: 'MESAS_VER' },
          })
        ).id,
      },
    });

    await request(app.getHttpServer())
      .get('/mesas')
      .set('Authorization', `Bearer ${tokenTrabajadorA}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(`/autorizacion/planes/${planTemporalId}/capacidades`)
      .set('Authorization', `Bearer ${tokenGlobal}`)
      .send({ codigos: ['MESAS'] })
      .expect(200);

    await request(app.getHttpServer())
      .get('/mesas')
      .set('Authorization', `Bearer ${tokenTrabajadorA}`)
      .expect(200);
  });
});
