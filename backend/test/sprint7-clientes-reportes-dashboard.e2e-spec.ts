import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AmbitoRol,
  EstrategiaInventario,
  UnidadInventario,
} from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('SPRINT 7 | Clientes, Reportes y Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const sufijo = `${Date.now().toString().slice(-8)}${Math.floor(
    Math.random() * 10000,
  )
    .toString()
    .padStart(4, '0')}`;

  let restauranteAId = 0;
  let restauranteBId = 0;
  let sucursalAId = 0;
  let sucursalBId = 0;
  let rolAId = 0;
  let rolBId = 0;
  let usuarioAId = 0;
  let usuarioBId = 0;
  let categoriaAId = 0;
  let categoriaBId = 0;
  let productoAId = 0;
  let clienteAId = 0;
  let clienteBId = 0;

  let tokenA = '';
  let tokenB = '';

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

    const [planPro, planMedio] = await Promise.all([
      prisma.plan.findUnique({
        where: {
          codigo: 'PRO',
        },
        select: {
          id: true,
        },
      }),
      prisma.plan.findUnique({
        where: {
          codigo: 'MEDIO',
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!planPro || !planMedio) {
      throw new Error(
        'El seed debe estar ejecutado: faltan los planes PRO o MEDIO',
      );
    }

    const permisos = await prisma.permiso.findMany({
      where: {
        codigo: {
          in: [
            'CLIENTES_VER',
            'CLIENTES_CREAR',
            'CLIENTES_EDITAR',
            'CLIENTES_DESACTIVAR',
            'VENTAS_CREAR',
            'VENTAS_VER',
            'REPORTES_VER',
          ],
        },
        activo: true,
      },
      select: {
        id: true,
        codigo: true,
      },
    });

    const codigosEncontrados = new Set(
      permisos.map((permiso) => permiso.codigo),
    );

    const codigosRequeridos = [
      'CLIENTES_VER',
      'CLIENTES_CREAR',
      'CLIENTES_EDITAR',
      'CLIENTES_DESACTIVAR',
      'VENTAS_CREAR',
      'VENTAS_VER',
      'REPORTES_VER',
    ];

    const faltantes = codigosRequeridos.filter(
      (codigo) => !codigosEncontrados.has(codigo),
    );

    if (faltantes.length > 0) {
      throw new Error(
        `El seed debe estar ejecutado. Faltan permisos: ${faltantes.join(', ')}`,
      );
    }

    const restauranteA = await prisma.restaurante.create({
      data: {
        nombre: `E2E Sprint7 A ${sufijo}`,
        nit: `E2ES7A${sufijo}`,
        estado: true,
        planId: planPro.id,
      },
    });

    const restauranteB = await prisma.restaurante.create({
      data: {
        nombre: `E2E Sprint7 B ${sufijo}`,
        nit: `E2ES7B${sufijo}`,
        estado: true,
        planId: planMedio.id,
      },
    });

    restauranteAId = restauranteA.id;
    restauranteBId = restauranteB.id;

    const sucursalA = await prisma.sucursal.create({
      data: {
        nombre: `Sucursal A ${sufijo}`,
        estado: true,
        restauranteId: restauranteA.id,
      },
    });

    const sucursalB = await prisma.sucursal.create({
      data: {
        nombre: `Sucursal B ${sufijo}`,
        estado: true,
        restauranteId: restauranteB.id,
      },
    });

    sucursalAId = sucursalA.id;
    sucursalBId = sucursalB.id;

    const rolA = await prisma.rol.create({
      data: {
        clave: `E2E:S7:${sufijo}:A`,
        nombre: `E2E_S7_A_${sufijo}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: restauranteA.id,
      },
    });

    const rolB = await prisma.rol.create({
      data: {
        clave: `E2E:S7:${sufijo}:B`,
        nombre: `E2E_S7_B_${sufijo}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: restauranteB.id,
      },
    });

    rolAId = rolA.id;
    rolBId = rolB.id;

    const permisosPorCodigo = new Map(
      permisos.map((permiso) => [permiso.codigo, permiso.id]),
    );

    await prisma.rolPermiso.createMany({
      data: codigosRequeridos.map((codigo) => ({
        rolId: rolA.id,
        permisoId: permisosPorCodigo.get(codigo),
      })),
    });

    await prisma.rolPermiso.createMany({
      data: ['CLIENTES_VER', 'CLIENTES_CREAR', 'REPORTES_VER'].map(
        (codigo) => ({
          rolId: rolB.id,
          permisoId: permisosPorCodigo.get(codigo),
        }),
      ),
    });

    const usuarioA = await prisma.usuario.create({
      data: {
        nombres: 'E2E',
        apellidos: 'Sprint7 A',
        email: `e2e-s7-a-${sufijo}@sigr.local`,
        password: 'e2e-no-login',
        activo: true,
        rolId: rolA.id,
        restauranteId: restauranteA.id,
        sucursalId: sucursalA.id,
      },
    });

    const usuarioB = await prisma.usuario.create({
      data: {
        nombres: 'E2E',
        apellidos: 'Sprint7 B',
        email: `e2e-s7-b-${sufijo}@sigr.local`,
        password: 'e2e-no-login',
        activo: true,
        rolId: rolB.id,
        restauranteId: restauranteB.id,
        sucursalId: sucursalB.id,
      },
    });

    usuarioAId = usuarioA.id;
    usuarioBId = usuarioB.id;

    tokenA = jwtService.sign({
      sub: usuarioA.id,
    });

    tokenB = jwtService.sign({
      sub: usuarioB.id,
    });

    const categoriaA = await prisma.categoria.create({
      data: {
        nombre: `E2E S7 Categoria A ${sufijo}`,
        estado: true,
        sucursalId: sucursalA.id,
      },
    });

    const categoriaB = await prisma.categoria.create({
      data: {
        nombre: `E2E S7 Categoria B ${sufijo}`,
        estado: true,
        sucursalId: sucursalB.id,
      },
    });

    categoriaAId = categoriaA.id;
    categoriaBId = categoriaB.id;

    const productoA = await prisma.producto.create({
      data: {
        nombre: `E2E S7 Producto A ${sufijo}`,
        precio: 12000,
        estrategiaInventario: EstrategiaInventario.NO_CONTROLAR,
        unidadInventario: UnidadInventario.UNIDAD,
        stock: 0,
        estado: true,
        categoriaId: categoriaA.id,
      },
    });

    await prisma.producto.create({
      data: {
        nombre: `E2E S7 Producto B ${sufijo}`,
        precio: 99000,
        estrategiaInventario: EstrategiaInventario.NO_CONTROLAR,
        unidadInventario: UnidadInventario.UNIDAD,
        stock: 0,
        estado: true,
        categoriaId: categoriaB.id,
      },
    });

    productoAId = productoA.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const usuarios = [usuarioAId, usuarioBId].filter(Boolean);

      if (usuarios.length > 0) {
        const ventas = await prisma.venta.findMany({
          where: {
            usuarioId: {
              in: usuarios,
            },
          },
          select: {
            id: true,
          },
        });

        const ventaIds = ventas.map((venta) => venta.id);

        if (ventaIds.length > 0) {
          await prisma.detalleVenta.deleteMany({
            where: {
              ventaId: {
                in: ventaIds,
              },
            },
          });

          await prisma.venta.deleteMany({
            where: {
              id: {
                in: ventaIds,
              },
            },
          });
        }
      }

      const clientes = [clienteAId, clienteBId].filter(Boolean);

      if (clientes.length > 0) {
        await prisma.cliente.deleteMany({
          where: {
            id: {
              in: clientes,
            },
          },
        });
      }

      const categorias = [categoriaAId, categoriaBId].filter(Boolean);

      if (categorias.length > 0) {
        await prisma.producto.deleteMany({
          where: {
            categoriaId: {
              in: categorias,
            },
          },
        });

        await prisma.categoria.deleteMany({
          where: {
            id: {
              in: categorias,
            },
          },
        });
      }

      if (usuarios.length > 0) {
        await prisma.eventoAuditoria.deleteMany({
          where: {
            actorId: {
              in: usuarios,
            },
          },
        });
        await prisma.usuario.deleteMany({
          where: {
            id: {
              in: usuarios,
            },
          },
        });
      }

      const roles = [rolAId, rolBId].filter(Boolean);

      if (roles.length > 0) {
        await prisma.rol.deleteMany({
          where: {
            id: {
              in: roles,
            },
          },
        });
      }

      const sucursales = [sucursalAId, sucursalBId].filter(Boolean);

      if (sucursales.length > 0) {
        await prisma.sucursal.deleteMany({
          where: {
            id: {
              in: sucursales,
            },
          },
        });
      }

      const restaurantes = [restauranteAId, restauranteBId].filter(Boolean);

      if (restaurantes.length > 0) {
        await prisma.restaurante.deleteMany({
          where: {
            id: {
              in: restaurantes,
            },
          },
        });
      }
    }

    if (app) {
      await app.close();
    }
  }, 30000);

  it('gestiona clientes y bloquea documentos duplicados dentro del mismo restaurante', async () => {
    const crear = await request(app.getHttpServer())
      .post('/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        tipoDocumento: 'CC',
        numeroDocumento: `S7A${sufijo}`,
        nombres: 'Cliente',
        apellidos: 'Sprint 7',
        correo: `CLIENTE-${sufijo}@SIGR.LOCAL`,
      })
      .expect(201);

    clienteAId = crear.body.id;

    expect(crear.body.restauranteId).toBe(restauranteAId);

    expect(crear.body.numeroDocumento).toBe(`S7A${sufijo}`);

    expect(crear.body.correo).toBe(`cliente-${sufijo}@sigr.local`);

    await request(app.getHttpServer())
      .post('/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        tipoDocumento: 'CC',
        numeroDocumento: `S7A${sufijo}`,
        nombres: 'Cliente duplicado',
      })
      .expect(409);
  }, 15000);

  it('aÃ­sla clientes entre restaurantes', async () => {
    const crearB = await request(app.getHttpServer())
      .post('/clientes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        tipoDocumento: 'CC',
        numeroDocumento: `S7B${sufijo}`,
        nombres: 'Cliente Tenant B',
      })
      .expect(201);

    clienteBId = crearB.body.id;

    await request(app.getHttpServer())
      .get(`/clientes/${clienteAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  }, 15000);

  it('expone paginacion uniforme y valida sus limites', async () => {
    const listado = await request(app.getHttpServer())
      .get('/clientes?pagina=1&limite=10')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(Array.isArray(listado.body.datos)).toBe(true);
    expect(listado.body.paginacion).toEqual(
      expect.objectContaining({
        pagina: 1,
        limite: 10,
        total: expect.any(Number),
        totalPaginas: expect.any(Number),
      }),
    );

    await request(app.getHttpServer())
      .get('/clientes?pagina=0&limite=101')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(400);
  });

  it('asocia Cliente a Venta y rechaza clientes de otro tenant', async () => {
    const venta = await request(app.getHttpServer())
      .post('/ventas/directa')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sucursalId: sucursalAId,
        clienteId: clienteAId,
        detalles: [
          {
            productoId: productoAId,
            cantidad: 1,
          },
        ],
      })
      .expect(201);

    expect(venta.body.clienteId).toBe(clienteAId);

    expect(venta.body.cliente?.id).toBe(clienteAId);

    await request(app.getHttpServer())
      .post('/ventas/directa')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sucursalId: sucursalAId,
        clienteId: clienteBId,
        detalles: [
          {
            productoId: productoAId,
            cantidad: 1,
          },
        ],
      })
      .expect(404);
  }, 15000);

  it('entrega Reportes/Dashboard aislados y bloquea ANALYTICS cuando el plan no lo incluye', async () => {
    const reporte = await request(app.getHttpServer())
      .get('/reportes/resumen')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(reporte.body.cantidadVentas).toBe(1);

    expect(reporte.body.totalVentas).toBe(12000);

    const dashboard = await request(app.getHttpServer())
      .get('/dashboard/resumen')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(dashboard.body.ventas.cantidad).toBe(1);

    expect(dashboard.body.ventas.total).toBe(12000);

    expect(dashboard.body.clientes.nuevosRestaurante).toBe(1);

    expect(dashboard.body.utilidad).toBeNull();

    await request(app.getHttpServer())
      .get('/reportes/resumen')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);
  }, 15000);
});
