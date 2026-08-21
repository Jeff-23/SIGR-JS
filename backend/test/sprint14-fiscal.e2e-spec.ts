import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AmbitoRol } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Sprint 14 | Configuración fiscal multiempresa (e2e)', () => {
  let app: INestApplication<App>;
  let modulo: TestingModule;
  let prisma: PrismaService;
  let jwt: JwtService;
  const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const restaurantes: number[] = [];
  const sucursales: number[] = [];
  const roles: number[] = [];
  const usuarios: number[] = [];
  let resolucionId = 0;
  let categoriaId = 0;
  let productoId = 0;
  let ventaId = 0;
  let facturaId = 0;
  let documentoId = 0;
  let tokenA = '';

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
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { codigo: 'PRO' },
    });
    const permisos = await prisma.permiso.findMany({
      where: {
        codigo: {
          in: [
            'CONFIGURACION_VER',
            'CONFIGURACION_GESTIONAR',
            'FACTURAS_EMITIR',
            'FACTURAS_VER',
          ],
        },
      },
    });
    const [a, b] = await Promise.all([
      prisma.restaurante.create({
        data: {
          nombre: `Fiscal A ${sufijo}`,
          nit: `FA${sufijo}`,
          planId: plan.id,
        },
      }),
      prisma.restaurante.create({
        data: {
          nombre: `Fiscal B ${sufijo}`,
          nit: `FB${sufijo}`,
          planId: plan.id,
        },
      }),
    ]);
    restaurantes.push(a.id, b.id);
    const sucursal = await prisma.sucursal.create({
      data: { nombre: `Fiscal sucursal ${sufijo}`, restauranteId: a.id },
    });
    sucursales.push(sucursal.id);
    const rol = await prisma.rol.create({
      data: {
        clave: `E2E:FISCAL:${sufijo}`,
        nombre: `E2E_FISCAL_${sufijo}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: a.id,
      },
    });
    roles.push(rol.id);
    await prisma.rolPermiso.createMany({
      data: permisos.map((permiso) => ({
        rolId: rol.id,
        permisoId: permiso.id,
      })),
    });
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Fiscal',
        apellidos: 'Admin',
        email: `fiscal-${sufijo}@test.local`,
        password: 'no-usada',
        rolId: rol.id,
        restauranteId: a.id,
      },
    });
    usuarios.push(usuario.id);
    tokenA = jwt.sign({ sub: usuario.id });
  });

  afterAll(async () => {
    await prisma.eventoAuditoria.deleteMany({
      where: { actorId: { in: usuarios } },
    });
    if (documentoId) {
      await prisma.historialDocumentoFiscal.deleteMany({
        where: { documentoId },
      });
      await prisma.outboxFiscal.deleteMany({ where: { documentoId } });
      await prisma.documentoElectronico.delete({ where: { id: documentoId } });
    }
    if (facturaId)
      await prisma.registroFacturaOperativa.deleteMany({
        where: { facturaId },
      });
    if (facturaId) await prisma.factura.delete({ where: { id: facturaId } });
    if (ventaId) {
      await prisma.detalleVenta.deleteMany({ where: { ventaId } });
      await prisma.venta.delete({ where: { id: ventaId } });
    }
    if (productoId) await prisma.producto.delete({ where: { id: productoId } });
    if (categoriaId)
      await prisma.categoria.delete({ where: { id: categoriaId } });
    await prisma.resolucionNumeracionDian.deleteMany({
      where: { restauranteId: { in: restaurantes } },
    });
    await prisma.perfilFiscal.deleteMany({
      where: { restauranteId: { in: restaurantes } },
    });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.rol.deleteMany({ where: { id: { in: roles } } });
    await prisma.sucursal.deleteMany({ where: { id: { in: sucursales } } });
    await prisma.restaurante.deleteMany({
      where: { id: { in: restaurantes } },
    });
    await app.close();
    await modulo.close();
  });

  it('configura referencias de secretos sin aceptar credenciales en claro', async () => {
    await request(app.getHttpServer())
      .put(`/fiscal/restaurantes/${restaurantes[0]}/perfil`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ambiente: 'HABILITACION',
        modoOperacion: 'PROVEEDOR_TECNOLOGICO',
        proveedorCodigo: 'PROVEEDOR_SANDBOX',
        responsabilidadFiscal: 'R-99-PN',
        municipioCodigo: '11001',
        credencialRef: 'token-en-claro',
        activo: true,
      })
      .expect(400);

    const perfil = await request(app.getHttpServer())
      .put(`/fiscal/restaurantes/${restaurantes[0]}/perfil`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ambiente: 'HABILITACION',
        modoOperacion: 'PROVEEDOR_TECNOLOGICO',
        proveedorCodigo: 'PROVEEDOR_SANDBOX',
        responsabilidadFiscal: 'R-99-PN',
        municipioCodigo: '11001',
        credencialRef: `secret://fiscal/${sufijo}/token`,
        activo: true,
      })
      .expect(200);
    expect(perfil.body).toMatchObject({
      restauranteId: restaurantes[0],
      ambiente: 'HABILITACION',
      activo: true,
    });
  });

  it('crea una resolución limitada al restaurante y sucursal', async () => {
    const resolucion = await request(app.getHttpServer())
      .post(`/fiscal/restaurantes/${restaurantes[0]}/resoluciones`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        numeroResolucion: `RES-${sufijo}`,
        prefijo: 'FV',
        rangoDesde: 1,
        rangoHasta: 100,
        vigenteDesde: '2026-01-01',
        vigenteHasta: '2027-01-01',
        sucursalId: sucursales[0],
        claveTecnicaRef: `secret://fiscal/${sufijo}/clave-tecnica`,
      })
      .expect(201);
    expect(resolucion.body).toMatchObject({
      restauranteId: restaurantes[0],
      sucursalId: sucursales[0],
      siguienteNumero: 1,
    });
    resolucionId = resolucion.body.id as number;
  });

  it('diagnostica el alta sin confundir configuración con transmisión real', async () => {
    const diagnostico = await request(app.getHttpServer())
      .get(`/fiscal/restaurantes/${restaurantes[0]}/diagnostico`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(diagnostico.body).toMatchObject({
      restauranteId: restaurantes[0],
      listoConfiguracion: true,
      listoTransmision: false,
      checks: {
        perfilFiscalActivo: true,
        referenciasSecretasSeguras: true,
        resolucionVigenteDisponible: true,
        proveedorConfigurado: true,
        proveedorSoportado: false,
      },
    });
    expect(diagnostico.body.proveedorDiagnostico.mensaje).toContain(
      'No existe un adaptador registrado',
    );
  });

  it('mantiene la venta manual independiente y numera sólo por acción explícita', async () => {
    const categoria = await prisma.categoria.create({
      data: { nombre: `Fiscal ${sufijo}`, sucursalId: sucursales[0] },
    });
    categoriaId = categoria.id;
    const producto = await prisma.producto.create({
      data: { nombre: `Producto fiscal ${sufijo}`, precio: 10000, categoriaId },
    });
    productoId = producto.id;
    const venta = await prisma.venta.create({
      data: {
        origen: 'MANUAL_CIERRE',
        estado: 'PAGADA',
        subtotal: 10000,
        impuestos: 0,
        impoconsumo: 800,
        descuentos: 0,
        propina: 0,
        total: 10800,
        fechaOperacion: new Date(),
        sucursalId: sucursales[0],
        usuarioId: usuarios[0],
        detalles: {
          create: {
            productoId,
            cantidad: 1,
            precioUnitario: 10000,
            subtotal: 10000,
          },
        },
      },
      include: { factura: true },
    });
    ventaId = venta.id;
    expect(venta.factura).toBeNull();
    const factura = await prisma.factura.create({
      data: { numero: `INT-FISCAL-${sufijo}`, total: venta.total, ventaId },
    });
    facturaId = factura.id;
    const documento = await prisma.documentoElectronico.create({
      data: { facturaId },
    });
    documentoId = documento.id;

    const solicitudes = [1, 2].map(() =>
      request(app.getHttpServer())
        .post(`/documentos-electronicos/${documentoId}/numerar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ resolucionId }),
    );
    const respuestas = await Promise.all(solicitudes);
    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual([
      201, 400,
    ]);
    const numerado = respuestas.find((respuesta) => respuesta.status === 201);
    if (!numerado) throw new Error('Una solicitud debe numerar el documento');
    expect(numerado.body).toMatchObject({
      estado: 'NUMERADO',
      numeroCompleto: 'FV1',
      firmado: false,
      transmitido: false,
    });
    const persistido = await prisma.documentoElectronico.findUniqueOrThrow({
      where: { id: documentoId },
      include: { historial: true },
    });
    expect(persistido.xmlHash).toHaveLength(64);
    expect(persistido.historial).toHaveLength(1);
    const resolucion = await prisma.resolucionNumeracionDian.findUniqueOrThrow({
      where: { id: resolucionId },
    });
    expect(resolucion.siguienteNumero).toBe(2);
  });

  it('falla cerrado y no encola con un proveedor no instalado', async () => {
    await request(app.getHttpServer())
      .post(`/documentos-electronicos/${documentoId}/encolar`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(400);
    const documento = await prisma.documentoElectronico.findUniqueOrThrow({
      where: { id: documentoId },
      include: { outbox: true },
    });
    expect(documento.estado).toBe('NUMERADO');
    expect(documento.outbox).toBeNull();
  });

  it('resume la operación fiscal del tenant sin exponer otro restaurante', async () => {
    const resumen = await request(app.getHttpServer())
      .get(`/fiscal/restaurantes/${restaurantes[0]}/resumen`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(resumen.body).toMatchObject({
      restauranteId: restaurantes[0],
      documentos: { NUMERADO: 1 },
      outbox: {},
    });
  });

  it('no permite cruzar a otro restaurante', async () => {
    await request(app.getHttpServer())
      .get(`/fiscal/restaurantes/${restaurantes[1]}/perfil`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/fiscal/restaurantes/${restaurantes[1]}/diagnostico`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
});
