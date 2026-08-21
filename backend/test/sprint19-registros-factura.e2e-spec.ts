import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AmbitoRol } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Sprint 19 | Archivo operativo de facturas (e2e)', () => {
  let app: INestApplication<App>;
  let modulo: TestingModule;
  let prisma: PrismaService;
  let jwt: JwtService;
  const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const restauranteIds: number[] = [];
  const sucursalIds: number[] = [];
  const usuarioIds: number[] = [];
  const rolIds: number[] = [];
  let sucursalId = 0;
  let tokenAdmin = '';
  let tokenConsulta = '';
  let tokenOtroTenant = '';
  let registroId = 0;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    const permisos = await prisma.permiso.findMany({
      where: {
        codigo: {
          in: [
            'REGISTROS_FACTURA_VER',
            'REGISTROS_FACTURA_CREAR',
            'REGISTROS_FACTURA_EXPORTAR',
            'REGISTROS_FACTURA_ELIMINAR',
          ],
        },
      },
    });

    for (const indice of [1, 2]) {
      const restaurante = await prisma.restaurante.create({
        data: {
          nombre: `S19 ${indice} ${sufijo}`,
          nit: `S19${indice}${sufijo}`,
        },
      });
      restauranteIds.push(restaurante.id);
      const sucursal = await prisma.sucursal.create({
        data: { nombre: `Sucursal ${indice}`, restauranteId: restaurante.id },
      });
      sucursalIds.push(sucursal.id);
      if (indice === 1) sucursalId = sucursal.id;
      const rol = await prisma.rol.create({
        data: {
          clave: `E2E:S19:${indice}:${sufijo}`,
          nombre: indice === 1 ? 'ADMIN_PRUEBA' : 'OTRO_TENANT',
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restaurante.id,
        },
      });
      rolIds.push(rol.id);
      await prisma.rolPermiso.createMany({
        data: permisos.map((permiso) => ({
          rolId: rol.id,
          permisoId: permiso.id,
        })),
      });
      const usuario = await prisma.usuario.create({
        data: {
          nombres: `Usuario ${indice}`,
          apellidos: 'Sprint19',
          email: `s19-${indice}-${sufijo}@test.local`,
          password: 'no-usada',
          rolId: rol.id,
          restauranteId: restaurante.id,
          sucursalId: indice === 2 ? sucursal.id : null,
        },
      });
      usuarioIds.push(usuario.id);
      if (indice === 1) tokenAdmin = jwt.sign({ sub: usuario.id });
      else tokenOtroTenant = jwt.sign({ sub: usuario.id });
    }

    const rolConsulta = await prisma.rol.create({
      data: {
        clave: `E2E:S19:CONSULTA:${sufijo}`,
        nombre: 'CONTADOR_PRUEBA',
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: restauranteIds[0],
      },
    });
    rolIds.push(rolConsulta.id);
    const ver = permisos.filter((permiso) =>
      ['REGISTROS_FACTURA_VER', 'REGISTROS_FACTURA_EXPORTAR'].includes(
        permiso.codigo,
      ),
    );
    await prisma.rolPermiso.createMany({
      data: ver.map((permiso) => ({
        rolId: rolConsulta.id,
        permisoId: permiso.id,
      })),
    });
    const consulta = await prisma.usuario.create({
      data: {
        nombres: 'Contador',
        apellidos: 'Sprint19',
        email: `s19-contador-${sufijo}@test.local`,
        password: 'no-usada',
        rolId: rolConsulta.id,
        restauranteId: restauranteIds[0],
        sucursalId: null,
      },
    });
    usuarioIds.push(consulta.id);
    tokenConsulta = jwt.sign({ sub: consulta.id });
  });

  afterAll(async () => {
    await prisma.eventoAuditoria.deleteMany({
      where: { restauranteId: { in: restauranteIds } },
    });
    await prisma.registroFacturaOperativa.deleteMany({
      where: { restauranteId: { in: restauranteIds } },
    });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
    await prisma.rolPermiso.deleteMany({ where: { rolId: { in: rolIds } } });
    await prisma.rol.deleteMany({ where: { id: { in: rolIds } } });
    await prisma.sucursal.deleteMany({ where: { id: { in: sucursalIds } } });
    await prisma.restaurante.deleteMany({
      where: { id: { in: restauranteIds } },
    });
    await app.close();
    await modulo.close();
  });

  it('registra papel con valores históricos, idempotencia y consolidación', async () => {
    const body = {
      numero: `PAP-${sufijo}`,
      numeroComanda: `COM-${sufijo}`,
      numeroSoporte: `SOP-${sufijo}`,
      origen: 'PAPEL',
      fechaOperacion: new Date().toISOString(),
      sucursalId,
      subtotal: 20000,
      descuentos: 0,
      impuestos: 1600,
      propina: 0,
      domicilio: 0,
      total: 21600,
      detalles: [
        {
          nombre: 'Almuerzo original',
          cantidad: 1,
          precioUnitario: 20000,
          total: 20000,
        },
      ],
    };
    const creado = await request(app.getHttpServer())
      .post('/registros-factura')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', `s19-${sufijo}`)
      .send(body)
      .expect(201);
    registroId = creado.body.id;
    const repetido = await request(app.getHttpServer())
      .post('/registros-factura')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Idempotency-Key', `s19-${sufijo}`)
      .send(body)
      .expect(201);
    expect(repetido.body.id).toBe(registroId);
    const listado = await request(app.getHttpServer())
      .get(`/registros-factura?sucursalId=${sucursalId}`)
      .set('Authorization', `Bearer ${tokenConsulta}`)
      .expect(200);
    expect(listado.body.resumen).toMatchObject({ cantidad: 1, total: '21600' });
  });

  it('aísla tenants, exporta y limita la eliminación al permiso administrativo', async () => {
    await request(app.getHttpServer())
      .get(`/registros-factura/${registroId}`)
      .set('Authorization', `Bearer ${tokenOtroTenant}`)
      .expect(404);
    const csv = await request(app.getHttpServer())
      .get('/registros-factura/exportar.csv')
      .set('Authorization', `Bearer ${tokenConsulta}`)
      .expect(200);
    expect(csv.text).toContain(`PAP-${sufijo}`);
    await request(app.getHttpServer())
      .delete(`/registros-factura/${registroId}`)
      .set('Authorization', `Bearer ${tokenConsulta}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/registros-factura/${registroId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/registros-factura/${registroId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(404);
  });
});
