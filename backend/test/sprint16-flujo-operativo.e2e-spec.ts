import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AmbitoRol } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Sprint 16 | Flujo operativo integral (e2e)', () => {
  let app: INestApplication<App>;
  let modulo: TestingModule;
  let prisma: PrismaService;
  let jwt: JwtService;
  const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let restauranteId = 0;
  let sucursalId = 0;
  let usuarioId = 0;
  let rolId = 0;
  let zonaId = 0;
  let mesaId = 0;
  let productoId = 0;
  let productoBarId = 0;
  let categoriaId = 0;
  let cajaId = 0;
  let token = '';
  let ventaMesaId = 0;
  let ventaManualId = 0;

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
    const restaurante = await prisma.restaurante.create({
      data: {
        nombre: `Sprint16 ${sufijo}`,
        nit: `S16${sufijo}`,
        planId: plan.id,
      },
    });
    restauranteId = restaurante.id;
    const sucursal = await prisma.sucursal.create({
      data: { nombre: `Sucursal S16 ${sufijo}`, restauranteId },
    });
    sucursalId = sucursal.id;
    const zona = await prisma.zona.create({
      data: { nombre: `Zona ${sufijo}`, sucursalId },
    });
    zonaId = zona.id;
    const mesa = await prisma.mesa.create({
      data: { numero: `S${sufijo.slice(-5)}`, capacidad: 4, zonaId },
    });
    mesaId = mesa.id;
    const categoria = await prisma.categoria.create({
      data: { nombre: `Categoría ${sufijo}`, sucursalId },
    });
    categoriaId = categoria.id;
    const producto = await prisma.producto.create({
      data: { nombre: `Plato ${sufijo}`, precio: 20000, categoriaId },
    });
    productoId = producto.id;
    const rol = await prisma.rol.create({
      data: {
        clave: `E2E:S16:${sufijo}`,
        nombre: `S16_${sufijo}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId,
      },
    });
    rolId = rol.id;
    const permisos = await prisma.permiso.findMany({
      where: {
        codigo: {
          in: [
            'MESAS_VER',
            'MESAS_EDITAR',
            'PEDIDOS_VER',
            'PEDIDOS_CREAR',
            'PEDIDOS_EDITAR',
            'PRODUCTOS_VER',
            'COMANDAS_ENVIAR',
            'COMANDAS_VER',
            'COMANDAS_ACTUALIZAR_ESTADO',
            'VENTAS_CREAR',
            'VENTAS_REGISTRAR_MANUAL',
            'PAGOS_REGISTRAR',
            'FACTURAS_EMITIR',
            'FACTURAS_VER',
            'CONFIGURACION_VER',
            'CONFIGURACION_GESTIONAR',
          ],
        },
      },
    });
    await prisma.rolPermiso.createMany({
      data: permisos.map((p) => ({ rolId, permisoId: p.id })),
    });
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Operador',
        apellidos: 'Sprint16',
        email: `s16-${sufijo}@test.local`,
        password: 'no-usada',
        rolId,
        restauranteId,
        sucursalId,
      },
    });
    usuarioId = usuario.id;
    token = jwt.sign({ sub: usuarioId });
    const caja = await prisma.caja.create({
      data: {
        nombre: `Caja ${sufijo}`,
        saldoInicial: 0,
        sucursalId,
        abiertaPorId: usuarioId,
      },
    });
    cajaId = caja.id;
    await prisma.configuracionRestaurante.createMany({
      data: [
        { restauranteId, clave: 'PORCENTAJE_IMPUESTO', valor: 10 },
        { restauranteId, clave: 'PREFIJO_FACTURA', valor: 'POS' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.eventoAuditoria.deleteMany({ where: { restauranteId } });
    const ventas = await prisma.venta.findMany({
      where: { sucursalId },
      select: { id: true },
    });
    const ventaIds = ventas.map((v) => v.id);
    const facturas = await prisma.factura.findMany({
      where: { ventaId: { in: ventaIds } },
      select: { id: true },
    });
    const facturaIds = facturas.map((f) => f.id);
    await prisma.registroFacturaOperativa.deleteMany({
      where: { sucursalId },
    });
    const documentos = await prisma.documentoElectronico.findMany({
      where: { facturaId: { in: facturaIds } },
      select: { id: true },
    });
    const documentoIds = documentos.map((d) => d.id);
    await prisma.historialDocumentoFiscal.deleteMany({
      where: { documentoId: { in: documentoIds } },
    });
    await prisma.outboxFiscal.deleteMany({
      where: { documentoId: { in: documentoIds } },
    });
    await prisma.documentoElectronico.deleteMany({
      where: { id: { in: documentoIds } },
    });
    await prisma.pago.deleteMany({ where: { ventaId: { in: ventaIds } } });
    await prisma.factura.deleteMany({ where: { id: { in: facturaIds } } });
    await prisma.movimientoInventario.deleteMany({
      where: { ventaId: { in: ventaIds } },
    });
    await prisma.detalleVenta.deleteMany({
      where: { ventaId: { in: ventaIds } },
    });
    await prisma.venta.deleteMany({ where: { id: { in: ventaIds } } });
    const pedidos = await prisma.pedido.findMany({
      where: { sucursalId },
      select: { id: true },
    });
    const pedidoIds = pedidos.map((p) => p.id);
    await prisma.detalleComanda.deleteMany({
      where: { comanda: { pedidoId: { in: pedidoIds } } },
    });
    await prisma.comanda.deleteMany({ where: { pedidoId: { in: pedidoIds } } });
    await prisma.domicilio.deleteMany({
      where: { pedidoId: { in: pedidoIds } },
    });
    await prisma.detallePedido.deleteMany({
      where: { pedidoId: { in: pedidoIds } },
    });
    await prisma.pedido.deleteMany({ where: { id: { in: pedidoIds } } });
    await prisma.resolucionNumeracionDian.deleteMany({
      where: { restauranteId },
    });
    await prisma.configuracionSucursal.deleteMany({ where: { sucursalId } });
    await prisma.configuracionRestaurante.deleteMany({
      where: { restauranteId },
    });
    await prisma.caja.deleteMany({ where: { id: cajaId } });
    await prisma.producto.deleteMany({
      where: { id: { in: [productoId, productoBarId] } },
    });
    await prisma.categoria.deleteMany({ where: { id: categoriaId } });
    await prisma.mesa.deleteMany({ where: { id: mesaId } });
    await prisma.zona.deleteMany({ where: { id: zonaId } });
    await prisma.usuario.deleteMany({ where: { id: usuarioId } });
    await prisma.rol.deleteMany({ where: { id: rolId } });
    await prisma.sucursal.deleteMany({ where: { id: sucursalId } });
    await prisma.restaurante.deleteMany({ where: { id: restauranteId } });
    await app.close();
    await modulo.close();
  });

  it('ocupa y libera una mesa sin consumo cuando no existe pedido', async () => {
    await request(app.getHttpServer())
      .patch(`/mesas/${mesaId}/ocupar-sin-pedido`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Clientes se sentaron' })
      .expect(200);
    const liberada = await request(app.getHttpServer())
      .patch(`/mesas/${mesaId}/liberar-sin-consumo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Se retiraron sin ordenar' })
      .expect(200);
    expect(liberada.body).toMatchObject({
      situacion: 'LIBRE',
      ocupacionManual: false,
    });
    const ocupaciones = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .patch(`/mesas/${mesaId}/ocupar-sin-pedido`)
          .set('Authorization', `Bearer ${token}`)
          .send({ motivo: 'Concurrencia' }),
      ),
    );
    expect(ocupaciones.map((r) => r.status).sort()).toEqual([200, 400]);
    await request(app.getHttpServer())
      .patch(`/mesas/${mesaId}/liberar-sin-consumo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Limpiar prueba concurrente' })
      .expect(200);
  });

  it('no libera la mesa pagada hasta que cocina y servicio entregan', async () => {
    const pedido = await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s16-pedido-mesa-${sufijo}`)
      .send({
        tipo: 'MESA',
        mesaId,
        detalles: [{ productoId, cantidad: 1 }],
      })
      .expect(201);
    const detalleId = pedido.body.detalles[0].id as number;
    const comanda = await request(app.getHttpServer())
      .post(`/pedidos/${pedido.body.id}/comandas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ detalles: [{ detallePedidoId: detalleId, cantidad: 1 }] })
      .expect(201);
    const venta = await request(app.getHttpServer())
      .post('/ventas/pedido')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s16-mesa-${sufijo}`)
      .send({ pedidoId: pedido.body.id })
      .expect(201);
    ventaMesaId = venta.body.id as number;
    expect(venta.body.total).toBe('22000');
    const metodo = await prisma.metodoPago.findFirstOrThrow({
      where: { activo: true },
    });
    await request(app.getHttpServer())
      .post(`/ventas/${ventaMesaId}/pagos`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s16-pago-${sufijo}`)
      .send({ metodoPagoId: metodo.id, monto: 22000, cajaId })
      .expect(201);
    expect(
      (await prisma.mesa.findUniqueOrThrow({ where: { id: mesaId } }))
        .situacion,
    ).toBe('OCUPADA');
    for (const estado of ['EN_PREPARACION', 'LISTA', 'ENTREGADA']) {
      await request(app.getHttpServer())
        .patch(`/comandas/${comanda.body.comandas[0].id}/estado`)
        .set('Authorization', `Bearer ${token}`)
        .send({ estado })
        .expect(200);
    }
    expect(
      (await prisma.mesa.findUniqueOrThrow({ where: { id: mesaId } }))
        .situacion,
    ).toBe('LIBRE');
  });

  it('preserva soporte, precios e impuestos originales y bloquea duplicados', async () => {
    const cuerpo = {
      sucursalId,
      fechaOperacion: new Date().toISOString(),
      numeroComandaPapel: `COM-${sufijo}`,
      numeroSoporte: `SOP-${sufijo}`,
      soporteArchivoRef: `storage://soportes/${sufijo}.jpg`,
      impuestos: 1900,
      impoconsumo: 0,
      detalles: [{ productoId, cantidad: 1, precioUnitario: 19000 }],
    };
    const venta = await request(app.getHttpServer())
      .post('/ventas/manual')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s16-manual-${sufijo}`)
      .send(cuerpo)
      .expect(201);
    ventaManualId = venta.body.id as number;
    expect(venta.body).toMatchObject({
      numeroComandaPapel: cuerpo.numeroComandaPapel,
      numeroSoporte: cuerpo.numeroSoporte,
      soporteArchivoRef: cuerpo.soporteArchivoRef,
      usuarioId,
      total: '20900',
    });
    expect(venta.body.detalles[0].precioUnitario).toBe('19000');
    await request(app.getHttpServer())
      .post('/ventas/manual')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s16-manual-duplicada-${sufijo}`)
      .send(cuerpo)
      .expect(409);
    const concurrente = {
      ...cuerpo,
      numeroComandaPapel: `COM-CON-${sufijo}`,
      numeroSoporte: `SOP-CON-${sufijo}`,
    };
    const duplicadas = await Promise.all(
      [1, 2].map((indice) =>
        request(app.getHttpServer())
          .post('/ventas/manual')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', `s16-con-${indice}-${sufijo}`)
          .send(concurrente),
      ),
    );
    expect(duplicadas.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('gestiona domicilio desde cocina hasta entrega al cliente', async () => {
    const pedido = await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s16-pedido-domicilio-${sufijo}`)
      .send({
        tipo: 'DOMICILIO',
        sucursalId,
        detalles: [{ productoId, cantidad: 1 }],
        domicilio: {
          destinatario: 'Cliente Domicilio',
          telefono: '3000000000',
          direccion: 'Calle 1 # 2-3',
          referencias: 'Puerta azul',
          costo: 5000,
        },
      })
      .expect(201);
    const comanda = await request(app.getHttpServer())
      .post(`/pedidos/${pedido.body.id}/comandas`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        detalles: [
          { detallePedidoId: pedido.body.detalles[0].id, cantidad: 1 },
        ],
      })
      .expect(201);
    const domicilioId = pedido.body.domicilio.id as number;
    await request(app.getHttpServer())
      .patch(`/pedidos/domicilios/${domicilioId}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'ASIGNADO', repartidorId: usuarioId })
      .expect(200);
    for (const estado of ['EN_PREPARACION', 'LISTA', 'ENTREGADA']) {
      await request(app.getHttpServer())
        .patch(`/comandas/${comanda.body.comandas[0].id}/estado`)
        .set('Authorization', `Bearer ${token}`)
        .send({ estado })
        .expect(200);
    }
    await request(app.getHttpServer())
      .patch(`/pedidos/domicilios/${domicilioId}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'EN_RUTA' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/pedidos/domicilios/${domicilioId}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'ENTREGADO' })
      .expect(200);
    expect(
      (await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.body.id } }))
        .estado,
    ).toBe('ENTREGADO');
    const venta = await request(app.getHttpServer())
      .post('/ventas/pedido')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s16-domicilio-${sufijo}`)
      .send({ pedidoId: pedido.body.id })
      .expect(201);
    expect(venta.body).toMatchObject({
      domicilioCosto: '5000',
      total: '27000',
    });
  });

  it('protege pedidos contra reintentos y conserva observaciones operativas', async () => {
    const clave = `s22-pedido-${sufijo}`;
    const cuerpo = {
      tipo: 'MOSTRADOR',
      sucursalId,
      detalles: [{ productoId, cantidad: 2, observaciones: 'Sin cebolla' }],
    };
    const primero = await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', clave)
      .send(cuerpo)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', clave)
      .send(cuerpo)
      .expect(201);
    expect(replay.body.id).toBe(primero.body.id);
    expect(primero.body.detalles[0].observaciones).toBe('Sin cebolla');
    expect(
      await prisma.pedido.count({ where: { idempotenciaClave: clave } }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', clave)
      .send({ ...cuerpo, detalles: [{ productoId, cantidad: 1 }] })
      .expect(409);

    const mesas = await request(app.getHttpServer())
      .get(`/mesas?sucursalId=${sucursalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mesas.body[0].zona.sucursalId).toBe(sucursalId);

    const productos = await request(app.getHttpServer())
      .get(`/productos?sucursalId=${sucursalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(productos.body[0].categoria.sucursalId).toBe(sucursalId);
  });

  it('divide una orden por estaciones y permite priorizar cada comanda', async () => {
    const bar = await prisma.estacionPreparacion.upsert({
      where: { sucursalId_codigo: { sucursalId, codigo: 'BAR' } },
      update: { estado: true },
      create: {
        sucursalId,
        codigo: 'BAR',
        nombre: 'Bar',
        color: '#3B82F6',
        orden: 20,
      },
    });
    const cocina = await prisma.estacionPreparacion.findUniqueOrThrow({
      where: { sucursalId_codigo: { sucursalId, codigo: 'COCINA' } },
    });
    await prisma.producto.update({
      where: { id: productoId },
      data: { estacionId: cocina.id },
    });
    const productoBar = await prisma.producto.create({
      data: {
        nombre: `Bebida ${sufijo}`,
        precio: 6000,
        categoriaId,
        estacionId: bar.id,
      },
    });
    productoBarId = productoBar.id;
    const pedido = await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `s23-estaciones-${sufijo}`)
      .send({
        tipo: 'MOSTRADOR',
        sucursalId,
        detalles: [
          { productoId, cantidad: 1 },
          { productoId: productoBarId, cantidad: 2 },
        ],
      })
      .expect(201);
    const envio = await request(app.getHttpServer())
      .post(`/pedidos/${pedido.body.id}/comandas`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        detalles: pedido.body.detalles.map(
          (detalle: { id: number; cantidad: number }) => ({
            detallePedidoId: detalle.id,
            cantidad: detalle.cantidad,
          }),
        ),
      })
      .expect(201);
    expect(envio.body.comandas).toHaveLength(2);
    const codigos = (
      envio.body.comandas as Array<{ estacion: { codigo: string } }>
    ).map((comanda) => comanda.estacion.codigo);
    expect(new Set(codigos)).toEqual(new Set(['COCINA', 'BAR']));
    const urgenteId = envio.body.comandas[0].id as number;
    await request(app.getHttpServer())
      .patch(`/comandas/${urgenteId}/prioridad`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prioridad: 'URGENTE' })
      .expect(200);
    const tablero = await request(app.getHttpServer())
      .get(`/comandas?sucursalId=${sucursalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      tablero.body.find((comanda: { id: number }) => comanda.id === urgenteId),
    ).toMatchObject({ prioridad: 'URGENTE' });
  });

  it('usa prefijo configurado y genera una tirilla interna segura', async () => {
    const factura = await request(app.getHttpServer())
      .post('/facturas/venta')
      .set('Authorization', `Bearer ${token}`)
      .send({ ventaId: ventaManualId })
      .expect(201);
    expect(factura.body.numero).toBe(`POS-${sucursalId}-${ventaManualId}`);
    const impresa = await request(app.getHttpServer())
      .get(`/facturas/${factura.body.id}/representacion-impresa`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(impresa.body.mediaType).toContain('text/html');
    expect(impresa.body.contenido).toContain('Representación interna');
    expect(impresa.body.electronicaAceptada).toBe(false);
  });

  it('rechaza resoluciones fiscales activas solapadas', async () => {
    const base = {
      prefijo: 'S16',
      rangoDesde: 1,
      rangoHasta: 100,
      vigenteDesde: '2026-01-01',
      vigenteHasta: '2027-01-01',
      sucursalId,
      claveTecnicaRef: `secret://s16/${sufijo}/clave`,
    };
    await request(app.getHttpServer())
      .post(`/fiscal/restaurantes/${restauranteId}/resoluciones`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, numeroResolucion: `R1-${sufijo}` })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/fiscal/restaurantes/${restauranteId}/resoluciones`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, numeroResolucion: `R2-${sufijo}`, rangoDesde: 50 })
      .expect(400);
  });
});
