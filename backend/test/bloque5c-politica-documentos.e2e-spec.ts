import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AmbitoRol } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Bloque 5C | Politica privada de documentos internos (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const sufijo = `${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
  const passwordSuperadmin = `Clave-Super-${sufijo}!`;
  const pinPrivado = '739251';
  let restauranteId = 0;
  let rolAdminId = 0;
  let rolCajeroId = 0;
  let superadminId = 0;
  let adminId = 0;
  let cajeroId = 0;
  let tokenSuperadmin = '';
  let tokenAdmin = '';

  beforeAll(async () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio para la prueba');
    process.env.PLATFORM_ADMIN_PIN_HASH = createHash('sha256')
      .update(`${jwtSecret}:${pinPrivado}`)
      .digest('hex');

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
              'DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE',
            ],
          },
          activo: true,
        },
        select: { id: true, codigo: true },
      }),
    ]);
    if (!rolGlobal || permisos.length !== 3) {
      throw new Error(
        'Ejecuta las migraciones del Bloque 5C antes de esta prueba',
      );
    }
    const permisoPorCodigo = new Map(permisos.map((p) => [p.codigo, p.id]));

    const restaurante = await prisma.restaurante.create({
      data: { nombre: `B5C ${sufijo}`, nit: `B5C${sufijo}` },
    });
    restauranteId = restaurante.id;

    const [rolAdmin, rolCajero] = await Promise.all([
      prisma.rol.create({
        data: {
          clave: `E2E:B5C:${restaurante.id}:ADMIN`,
          nombre: 'ADMIN',
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restaurante.id,
        },
      }),
      prisma.rol.create({
        data: {
          clave: `E2E:B5C:${restaurante.id}:CAJERO`,
          nombre: 'CAJERO',
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restaurante.id,
        },
      }),
    ]);
    rolAdminId = rolAdmin.id;
    rolCajeroId = rolCajero.id;

    await prisma.rolPermiso.createMany({
      data: ['AUTORIZACION_VER', 'AUTORIZACION_GESTIONAR'].map((codigo) => ({
        rolId: rolAdmin.id,
        permisoId: permisoPorCodigo.get(codigo),
      })),
    });

    const [superadmin, admin, cajero] = await Promise.all([
      prisma.usuario.create({
        data: {
          nombres: 'Super',
          apellidos: 'B5C',
          email: `super-b5c-${sufijo}@test.local`,
          password: await bcrypt.hash(passwordSuperadmin, 10),
          rolId: rolGlobal.id,
          restauranteId: null,
          sucursalId: null,
        },
      }),
      prisma.usuario.create({
        data: {
          nombres: 'Admin',
          apellidos: 'B5C',
          email: `admin-b5c-${sufijo}@test.local`,
          password: await bcrypt.hash(`Admin-${sufijo}!`, 10),
          rolId: rolAdmin.id,
          restauranteId: restaurante.id,
        },
      }),
      prisma.usuario.create({
        data: {
          nombres: 'Cajero',
          apellidos: 'B5C',
          email: `cajero-b5c-${sufijo}@test.local`,
          password: await bcrypt.hash(`Cajero-${sufijo}!`, 10),
          rolId: rolCajero.id,
          restauranteId: restaurante.id,
        },
      }),
    ]);
    superadminId = superadmin.id;
    adminId = admin.id;
    cajeroId = cajero.id;
    tokenSuperadmin = jwtService.sign({ sub: superadmin.id });
    tokenAdmin = jwtService.sign({ sub: admin.id });
  });

  afterAll(async () => {
    await prisma.eventoAuditoria.deleteMany({
      where: { actorId: { in: [superadminId, adminId, cajeroId] } },
    });
    await prisma.configuracionRestaurante.deleteMany({
      where: { restauranteId },
    });
    await prisma.usuario.deleteMany({
      where: { id: { in: [superadminId, adminId, cajeroId] } },
    });
    await prisma.rol.deleteMany({
      where: { id: { in: [rolAdminId, rolCajeroId] } },
    });
    await prisma.restaurante.delete({ where: { id: restauranteId } });
    await app.close();
    await moduleRef.close();
  });

  it('mantiene CONTROLADA por defecto y solo SUPERADMIN puede cambiarla con contraseña + PIN', async () => {
    await request(app.getHttpServer())
      .get(
        `/autorizacion/restaurantes/${restauranteId}/politica-documentos-internos`,
      )
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(403);

    const inicial = await request(app.getHttpServer())
      .get(
        `/autorizacion/restaurantes/${restauranteId}/politica-documentos-internos`,
      )
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .expect(200);
    expect(inicial.body.modo).toBe('CONTROLADA');

    await request(app.getHttpServer())
      .put(
        `/autorizacion/restaurantes/${restauranteId}/politica-documentos-internos`,
      )
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send({ modo: 'FLEXIBLE', password: passwordSuperadmin, pin: '000000' })
      .expect(401);

    const flexible = await request(app.getHttpServer())
      .put(
        `/autorizacion/restaurantes/${restauranteId}/politica-documentos-internos`,
      )
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send({ modo: 'FLEXIBLE', password: passwordSuperadmin, pin: pinPrivado })
      .expect(200);
    expect(flexible.body).toMatchObject({
      restauranteId,
      modo: 'FLEXIBLE',
      permisoCajero: 'DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE',
    });

    const guardada = await prisma.configuracionRestaurante.findUniqueOrThrow({
      where: {
        restauranteId_clave: {
          restauranteId,
          clave: 'POLITICA_DOCUMENTOS_INTERNOS',
        },
      },
    });
    expect(guardada.valor).toBe('FLEXIBLE');

    const auditoriaPrivada = await prisma.eventoAuditoria.findFirst({
      where: {
        actorId: superadminId,
        accion: 'POLITICA_DOCUMENTOS_INTERNOS_ACTUALIZADA',
      },
      orderBy: { id: 'desc' },
    });
    expect(auditoriaPrivada?.restauranteId).toBeNull();
  });

  it('no concede el permiso al CAJERO por defecto y el ADMIN puede delegarlo explícitamente', async () => {
    const permiso = await prisma.permiso.findUniqueOrThrow({
      where: { codigo: 'DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE' },
    });
    expect(
      await prisma.rolPermiso.findUnique({
        where: {
          rolId_permisoId: { rolId: rolCajeroId, permisoId: permiso.id },
        },
      }),
    ).toBeNull();

    await request(app.getHttpServer())
      .put(`/autorizacion/roles/${rolCajeroId}/permisos`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ codigos: ['DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE'] })
      .expect(200);

    const asignado = await prisma.rolPermiso.findUnique({
      where: {
        rolId_permisoId: { rolId: rolCajeroId, permisoId: permiso.id },
      },
    });
    expect(asignado).not.toBeNull();
  });
});
