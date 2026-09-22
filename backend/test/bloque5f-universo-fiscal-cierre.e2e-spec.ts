import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AmbitoRol,
  EstadoDocumentoElectronico,
  EstadoVenta,
  OrigenVenta,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Bloque 5F | Universo fiscal definitivo del turno (e2e)', () => {
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
  let facturaAceptadaId = 0;
  let facturaProcesoId = 0;
  let facturaElegibleId = 0;
  let facturaExcluidaId = 0;
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
        codigo: { in: ['CAJA_CERRAR', 'FACTURAS_EMITIR'] },
        activo: true,
      },
      select: { id: true },
    });
    if (permisos.length !== 2) {
      throw new Error(
        'Los permisos requeridos por Bloque 5F no están disponibles',
      );
    }

    const restaurante = await prisma.restaurante.create({
      data: { nombre: `B5F ${sufijo}`, nit: `B5F${sufijo}` },
    });
    restauranteId = restaurante.id;
    const sucursal = await prisma.sucursal.create({
      data: { nombre: `Sucursal B5F ${sufijo}`, restauranteId },
    });
    sucursalId = sucursal.id;
    const rol = await prisma.rol.create({
      data: {
        clave: `E2E:B5F:${restauranteId}:ADMIN`,
        nombre: 'ADMIN B5F',
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
        nombres: 'Admin',
        apellidos: 'B5F',
        email: `admin-b5f-${sufijo}@test.local`,
        password: await bcrypt.hash(`Clave-${sufijo}!`, 10),
        rolId,
        restauranteId,
        sucursalId,
      },
    });
    usuarioId = usuario.id;
    token = jwtService.sign({ sub: usuarioId });

    const caja = await prisma.caja.create({
      data: {
        nombre: 'Turno B5F',
        saldoInicial: 0,
        sucursalId,
        abiertaPorId: usuarioId,
      },
    });
    cajaId = caja.id;

    async function crearVentaConFactura(numero: string, total: number) {
      const venta = await prisma.venta.create({
        data: {
          origen: OrigenVenta.DIRECTA,
          estado: EstadoVenta.PAGADA,
          subtotal: total,
          impuestos: 0,
          total,
          fechaOperacion: new Date(),
          sucursalId,
          usuarioId,
        },
      });
      const factura = await prisma.factura.create({
        data: { numero, total, ventaId: venta.id },
      });
      return { venta, factura };
    }

    const aceptada = await crearVentaConFactura(`INT-B5F-A-${sufijo}`, 10000);
    facturaAceptadaId = aceptada.factura.id;
    await prisma.documentoElectronico.create({
      data: {
        facturaId: aceptada.factura.id,
        estado: EstadoDocumentoElectronico.ACEPTADO,
        numeroFiscal: 1001,
        prefijo: 'FE',
        numeroCompleto: 'FE1001',
        cufe: `CUFE-${sufijo}`,
        qrCode: `QR-${sufijo}`,
      },
    });

    const proceso = await crearVentaConFactura(`INT-B5F-P-${sufijo}`, 20000);
    facturaProcesoId = proceso.factura.id;
    await prisma.documentoElectronico.create({
      data: {
        facturaId: proceso.factura.id,
        estado: EstadoDocumentoElectronico.PREPARADO,
      },
    });

    const elegible = await crearVentaConFactura(`INT-B5F-E-${sufijo}`, 30000);
    facturaElegibleId = elegible.factura.id;

    const excluida = await crearVentaConFactura(`INT-B5F-X-${sufijo}`, 40000);
    facturaExcluidaId = excluida.factura.id;
    await prisma.factura.update({
      where: { id: excluida.factura.id },
      data: {
        estado: 'EXCLUIDA_CIERRE',
        excluidaCierreEn: new Date(),
        excluidaCierreCajaId: cajaId,
        excluidaCierrePorId: usuarioId,
        exclusionCierreMotivo: 'Prueba B5F',
      },
    });

    const ventas = [
      aceptada.venta,
      proceso.venta,
      elegible.venta,
      excluida.venta,
    ];
    const snapshot = {
      version: 1,
      caja: {
        id: cajaId,
        nombre: 'Turno B5F',
        sucursalId,
        sucursal: 'Sucursal B5F',
        fechaApertura: new Date().toISOString(),
        generadoEn: new Date().toISOString(),
      },
      resumen: {
        operaciones: ventas.length,
        totalVentas: 100000,
        totalPagos: 100000,
        totalDevoluciones: 0,
        totalNetoCobrado: 100000,
        efectivo: 100000,
        otrosPagos: 0,
      },
      ventas: ventas.map((venta) => ({
        ventaId: venta.id,
        fechaOperacion: venta.fechaOperacion.toISOString(),
        estado: venta.estado,
        origen: venta.origen,
        subtotal: Number(venta.subtotal),
        impuestos: Number(venta.impuestos),
        impoconsumo: Number(venta.impoconsumo),
        descuentos: Number(venta.descuentos),
        propina: Number(venta.propina),
        domicilio: Number(venta.domicilioCosto),
        total: Number(venta.total),
        pedidoId: null,
        mesa: null,
        cliente: null,
        identificacionCliente: null,
        facturaInterna: null,
        estadoFactura: null,
        documentoElectronicoEstado: null,
        documentoElectronicoNumero: null,
        fiscalizada: false,
        detalles: [],
        pagos: [],
      })),
    };
    await prisma.caja.update({
      where: { id: cajaId },
      data: {
        preCierreGeneradoEn: new Date(),
        preCierreExcelDescargadoEn: new Date(),
        preCierreSnapshot: snapshot,
        preCierreHash: `HASH-${sufijo}`,
        preCierreGeneradoPorId: usuarioId,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.documentoElectronico.deleteMany({
        where: {
          facturaId: {
            in: [facturaAceptadaId, facturaProcesoId, facturaElegibleId],
          },
        },
      });
      await prisma.factura.deleteMany({
        where: {
          id: {
            in: [
              facturaAceptadaId,
              facturaProcesoId,
              facturaElegibleId,
              facturaExcluidaId,
            ],
          },
        },
      });
      await prisma.venta.deleteMany({ where: { sucursalId } });
      await prisma.caja.deleteMany({ where: { id: cajaId } });
      await prisma.usuario.deleteMany({ where: { id: usuarioId } });
      await prisma.rolPermiso.deleteMany({ where: { rolId } });
      await prisma.rol.deleteMany({ where: { id: rolId } });
      await prisma.sucursal.deleteMany({ where: { id: sucursalId } });
      await prisma.restaurante.deleteMany({ where: { id: restauranteId } });
    }
    await app?.close();
    await moduleRef?.close();
  });

  it('separa aceptados, en proceso, excluidos y elegibles sin duplicar la factura inmediata', async () => {
    const response = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/fiscalizacion`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.habilitado).toBe(true);
    expect(response.body.resumen).toMatchObject({
      operaciones: 4,
      excluidas: 1,
      yaFiscalizadas: 1,
      enProceso: 1,
      elegibles: 1,
      sinComprobante: 0,
    });
    expect(response.body.yaFiscalizadas[0]).toMatchObject({
      facturaId: facturaAceptadaId,
      estadoDocumento: 'ACEPTADO',
      numeroFiscal: 'FE1001',
    });
    expect(response.body.enProceso[0].facturaId).toBe(facturaProcesoId);
    expect(response.body.elegibles[0].facturaId).toBe(facturaElegibleId);
  });

  it('prepara solo elegibles y bloquea reusar documentos que ya iniciaron flujo electrónico', async () => {
    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/fiscalizacion/preparar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ facturaIds: [facturaAceptadaId] })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/fiscalizacion/preparar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ facturaIds: [facturaExcluidaId] })
      .expect(400);

    const preparado = await request(app.getHttpServer())
      .post(`/cajas/${cajaId}/cierre-turno/fiscalizacion/preparar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ facturaIds: [facturaElegibleId] })
      .expect(201);

    expect(preparado.body.preparados).toBe(1);
    expect(preparado.body.documentos[0]).toMatchObject({
      facturaId: facturaElegibleId,
      estado: 'PREPARADO',
      numeroCompleto: null,
    });

    const documento = await prisma.documentoElectronico.findUnique({
      where: { facturaId: facturaElegibleId },
    });
    expect(documento?.estado).toBe(EstadoDocumentoElectronico.PREPARADO);
    expect(documento?.numeroFiscal).toBeNull();
    expect(documento?.numeroCompleto).toBeNull();

    const universo = await request(app.getHttpServer())
      .get(`/cajas/${cajaId}/cierre-turno/fiscalizacion`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(universo.body.resumen).toMatchObject({
      yaFiscalizadas: 1,
      enProceso: 2,
      elegibles: 0,
      excluidas: 1,
    });
  });
});
