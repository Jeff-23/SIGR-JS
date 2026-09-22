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

describe('Bloque 5E | Exclusión controlada de documentos internos (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const sufijo = `${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
  const password = `Clave-${sufijo}!`;
  let restauranteId = 0;
  let sucursalId = 0;
  let usuarioId = 0;
  let rolId = 0;
  let cajaId = 0;
  let categoriaId = 0;
  let productoId = 0;
  let metodoPagoId = 0;
  let ventaInternaId = 0;
  let ventaFiscalizadaId = 0;
  let facturaInternaId = 0;
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
        codigo: {
          in: [
            'CAJA_CERRAR',
            'CAJA_VER',
            'FACTURAS_VER',
            'DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE',
          ],
        },
        activo: true,
      },
      select: { id: true },
    });
    if (permisos.length !== 4) {
      throw new Error(
        'Los permisos requeridos por Bloque 5E no están disponibles',
      );
    }

    const restaurante = await prisma.restaurante.create({
      data: { nombre: `B5E ${sufijo}`, nit: `B5E${sufijo}` },
    });
    restauranteId = restaurante.id;

    const sucursal = await prisma.sucursal.create({
      data: { nombre: `Sucursal B5E ${sufijo}`, restauranteId },
    });
    sucursalId = sucursal.id;

    const rol = await prisma.rol.create({
      data: {
        clave: `E2E:B5E:${restauranteId}:CAJERO`,
        nombre: 'CAJERO B5E',
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
        apellidos: 'B5E',
        email: `cajero-b5e-${sufijo}@test.local`,
        password: await bcrypt.hash(password, 10),
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
      data: { nombre: `Categoría B5E ${sufijo}`, sucursalId },
    });
    categoriaId = categoria.id;
    const producto = await prisma.producto.create({
      data: {
        nombre: `Producto B5E ${sufijo}`,
        precio: 25000,
        categoriaId,
        requierePreparacion: false,
      },
    });
    productoId = producto.id;
    const metodo = await prisma.metodoPago.create({
      data: {
        nombre: `Efectivo B5E ${sufijo}`,
        tipo: TipoMetodoPago.EFECTIVO,
      },
    });
    metodoPagoId = metodo.id;

    const caja = await prisma.caja.create({
      data: {
        nombre: 'Turno B5E',
        saldoInicial: 50000,
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
    const facturaInterna = await prisma.factura.create({
      data: {
        numero: `INT-B5E-${sufijo}`,
        total: 25000,
        ventaId: interna.id,
      },
    });
    facturaInternaId = facturaInterna.id;

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
    const facturaFiscalizada = await prisma.factura.create({
      data: {
        numero: `INT-B5E-FE-${sufijo}`,
        total: 30000,
        ventaId: fiscalizada.id,
      },
    });
    facturaFiscalizadaId = facturaFiscalizada.id;
    await prisma.documentoElectronico.create({
      data: {
        facturaId: facturaFiscalizada.id,
        estado: EstadoDocumentoElectronico.ACEPTADO,
        numeroCompleto: `FE-B5E-${sufijo}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.documentoElectronico.deleteMany({
      where: { facturaId: facturaFiscalizadaId },
    });
    await prisma.factura.deleteMany({
      where: { id: { in: [facturaInternaId, facturaFiscalizadaId] } },
    });
    await prisma.detalleVenta.deleteMany({
      where: { ventaId: { in: [ventaInternaId, ventaFiscalizadaId] } },
    });
    await prisma.pago.deleteMany({
      where: { ventaId: { in: [ventaInternaId, ventaFiscalizadaId] } },
    });
    await prisma.venta.deleteMany({
      where: { id: { in: [ventaInternaId, ventaFiscalizadaId] } },
    });
    await prisma.caja.deleteMany({ where: { id: cajaId } });
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

  it('solo habilita exclusiones después del Excel y exige la contraseña del usuario', async () => {
    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/preparar`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/exclusiones`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ventaIds: [ventaInternaId],
        motivo: 'Revisión de cierre',
        password,
      })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/excel`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const disponibles = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/exclusiones`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(disponibles.body.habilitado).toBe(true);
    expect(disponibles.body.candidatos).toEqual([
      expect.objectContaining({
        ventaId: ventaInternaId,
        facturaId: facturaInternaId,
      }),
    ]);

    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/exclusiones`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ventaIds: [ventaInternaId],
        motivo: 'Revisión de cierre',
        password: 'incorrecta',
      })
      .expect(400);
  });

  it('bloquea documentos electrónicos y excluye solo el comprobante interno sin alterar venta, pago ni caja', async () => {
    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/exclusiones`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ventaIds: [ventaFiscalizadaId],
        motivo: 'No debe permitirse',
        password,
      })
      .expect(400);

    const respuesta = await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/exclusiones`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ventaIds: [ventaInternaId],
        motivo: 'Documento retirado del cierre',
        password,
      })
      .expect(201);
    expect(respuesta.body).toMatchObject({ cajaId, cantidad: 1 });

    const factura = await prisma.factura.findUniqueOrThrow({
      where: { id: facturaInternaId },
    });
    expect(factura.estado).toBe('EXCLUIDA_CIERRE');
    expect(factura.excluidaCierreEn).toBeTruthy();
    expect(factura.excluidaCierreCajaId).toBe(cajaId);
    expect(factura.excluidaCierrePorId).toBe(usuarioId);

    const venta = await prisma.venta.findUniqueOrThrow({
      where: { id: ventaInternaId },
    });
    expect(venta.estado).toBe(EstadoVenta.PAGADA);
    expect(Number(venta.total)).toBe(25000);
    expect(
      await prisma.pago.count({ where: { ventaId: ventaInternaId } }),
    ).toBe(1);
    expect(await prisma.caja.count({ where: { id: cajaId } })).toBe(1);

    await request(app.getHttpServer())
      .get(`/facturas/${facturaInternaId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const lista = await request(app.getHttpServer())
      .get('/facturas')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (lista.body as Array<{ id: number }>).some(
        (item) => item.id === facturaInternaId,
      ),
    ).toBe(false);

    const disponibles = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/exclusiones`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(disponibles.body.candidatos).toHaveLength(0);
  });
});
