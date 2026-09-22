import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AmbitoRol,
  EstadoDocumentoElectronico,
  EstadoVenta,
  OrigenVenta,
  TipoMetodoPago,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Bloque 5D | Cierre previo por turno (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const sufijo = `${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
  let restauranteId = 0;
  let sucursalId = 0;
  let usuarioId = 0;
  let rolId = 0;
  let cajaId = 0;
  let segundaCajaId = 0;
  let categoriaId = 0;
  let productoId = 0;
  let metodoPagoId = 0;
  let ventaInternaId = 0;
  let ventaFiscalizadaId = 0;
  let facturaFiscalizadaId = 0;
  let token = '';

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

    const permisos = await prisma.permiso.findMany({
      where: {
        codigo: { in: ['CAJA_CERRAR', 'CAJA_VER', 'CAJA_MOVIMIENTOS'] },
        activo: true,
      },
      select: { id: true, codigo: true },
    });
    if (permisos.length !== 3) {
      throw new Error('Los permisos de caja requeridos no están disponibles');
    }

    const restaurante = await prisma.restaurante.create({
      data: { nombre: `B5D ${sufijo}`, nit: `B5D${sufijo}` },
    });
    restauranteId = restaurante.id;

    const sucursal = await prisma.sucursal.create({
      data: { nombre: `Sucursal B5D ${sufijo}`, restauranteId },
    });
    sucursalId = sucursal.id;

    const rol = await prisma.rol.create({
      data: {
        clave: `E2E:B5D:${restauranteId}:CAJERO`,
        nombre: 'CAJERO B5D',
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId,
      },
    });
    rolId = rol.id;
    await prisma.rolPermiso.createMany({
      data: permisos.map((permiso) => ({ rolId, permisoId: permiso.id })),
    });

    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Cajero',
        apellidos: 'B5D',
        email: `cajero-b5d-${sufijo}@test.local`,
        password: await bcrypt.hash(`Clave-${sufijo}!`, 10),
        rolId,
        restauranteId,
        sucursalId,
      },
    });
    usuarioId = usuario.id;
    token = jwtService.sign({ sub: usuarioId });

    await prisma.configuracionRestaurante.create({
      data: {
        restauranteId,
        clave: 'POLITICA_DOCUMENTOS_INTERNOS',
        valor: 'FLEXIBLE',
      },
    });

    const categoria = await prisma.categoria.create({
      data: { nombre: `Categoría B5D ${sufijo}`, sucursalId },
    });
    categoriaId = categoria.id;
    const producto = await prisma.producto.create({
      data: {
        nombre: `Producto B5D ${sufijo}`,
        precio: 25000,
        categoriaId,
        requierePreparacion: false,
      },
    });
    productoId = producto.id;
    const metodo = await prisma.metodoPago.create({
      data: {
        nombre: `Efectivo B5D ${sufijo}`,
        tipo: TipoMetodoPago.EFECTIVO,
      },
    });
    metodoPagoId = metodo.id;

    const caja = await prisma.caja.create({
      data: {
        nombre: 'Turno 1',
        saldoInicial: 100000,
        sucursalId,
        abiertaPorId: usuarioId,
      },
    });
    cajaId = caja.id;

    const interna = await prisma.venta.create({
      data: {
        origen: OrigenVenta.DIRECTA,
        estado: EstadoVenta.PAGADA,
        subtotal: 25000,
        impuestos: 0,
        total: 25000,
        fechaOperacion: new Date(),
        sucursalId,
        usuarioId,
        detalles: {
          create: {
            cantidad: 1,
            precioUnitario: 25000,
            subtotal: 25000,
            productoId,
          },
        },
        pagos: {
          create: {
            monto: 25000,
            metodoPagoId,
            cajaId,
            usuarioId,
          },
        },
      },
    });
    ventaInternaId = interna.id;

    const fiscalizada = await prisma.venta.create({
      data: {
        origen: OrigenVenta.DIRECTA,
        estado: EstadoVenta.PAGADA,
        subtotal: 30000,
        impuestos: 0,
        total: 30000,
        fechaOperacion: new Date(),
        sucursalId,
        usuarioId,
        detalles: {
          create: {
            cantidad: 1,
            precioUnitario: 30000,
            subtotal: 30000,
            productoId,
          },
        },
        pagos: {
          create: {
            monto: 30000,
            metodoPagoId,
            cajaId,
            usuarioId,
          },
        },
      },
    });
    ventaFiscalizadaId = fiscalizada.id;

    const factura = await prisma.factura.create({
      data: {
        numero: `INT-B5D-${sufijo}`,
        total: 30000,
        ventaId: fiscalizada.id,
      },
    });
    facturaFiscalizadaId = factura.id;
    await prisma.documentoElectronico.create({
      data: {
        facturaId: factura.id,
        estado: EstadoDocumentoElectronico.ACEPTADO,
        numeroCompleto: `FE-${sufijo}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.documentoElectronico.deleteMany({
      where: { facturaId: facturaFiscalizadaId },
    });
    await prisma.factura.deleteMany({ where: { id: facturaFiscalizadaId } });
    await prisma.detalleVenta.deleteMany({
      where: { ventaId: { in: [ventaInternaId, ventaFiscalizadaId] } },
    });
    await prisma.pago.deleteMany({
      where: { ventaId: { in: [ventaInternaId, ventaFiscalizadaId] } },
    });
    await prisma.venta.deleteMany({
      where: { id: { in: [ventaInternaId, ventaFiscalizadaId] } },
    });
    await prisma.caja.deleteMany({
      where: { id: { in: [cajaId, segundaCajaId] } },
    });
    await prisma.producto.deleteMany({ where: { id: productoId } });
    await prisma.categoria.deleteMany({ where: { id: categoriaId } });
    await prisma.metodoPago.deleteMany({ where: { id: metodoPagoId } });
    await prisma.configuracionRestaurante.deleteMany({
      where: { restauranteId },
    });
    await prisma.usuario.deleteMany({ where: { id: usuarioId } });
    await prisma.rol.deleteMany({ where: { id: rolId } });
    await prisma.sucursal.deleteMany({ where: { id: sucursalId } });
    await prisma.restaurante.deleteMany({ where: { id: restauranteId } });
    await app.close();
    await moduleRef.close();
  });

  it('congela el turno, exige descargar Excel y genera PDF con las ventas originales', async () => {
    const inicial = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/estado`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(inicial.body).toMatchObject({
      modoFlexible: true,
      operaciones: 0,
      listoParaCerrar: false,
    });

    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ saldoContado: 155000 })
      .expect(400);

    const preparado = await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/preparar`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(preparado.body.snapshot.resumen.operaciones).toBe(2);
    expect(preparado.body.snapshot.ventas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ventaId: ventaInternaId,
          fiscalizada: false,
        }),
        expect.objectContaining({
          ventaId: ventaFiscalizadaId,
          fiscalizada: true,
          documentoElectronicoEstado: 'ACEPTADO',
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/movimientos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'INGRESO', monto: 1000, concepto: 'No debe entrar' })
      .expect(400);

    const excel = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/excel`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect(
        'Content-Type',
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      );
    const excelText = (excel.body as Buffer).toString('utf8');
    expect(excelText).toContain(String(ventaInternaId));
    expect(excelText).toContain(String(ventaFiscalizadaId));
    expect(excelText).toContain('ACEPTADO');

    const pdf = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/pdf`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const listo = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/estado`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listo.body.listoParaCerrar).toBe(true);
    expect(listo.body.excelDescargadoEn).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ saldoContado: 155000 })
      .expect(201);
  });

  it('mantiene el segundo turno independiente del cierre anterior', async () => {
    const segunda = await prisma.caja.create({
      data: {
        nombre: 'Turno 2',
        saldoInicial: 50000,
        sucursalId,
        abiertaPorId: usuarioId,
      },
    });
    segundaCajaId = segunda.id;

    const estado = await request(app.getHttpServer())
      .get(`/cajas/${segundaCajaId}/cierre-turno/estado`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(estado.body).toMatchObject({
      modoFlexible: true,
      operaciones: 0,
      listoParaCerrar: false,
      generadoEn: null,
      excelDescargadoEn: null,
    });
  });
});
