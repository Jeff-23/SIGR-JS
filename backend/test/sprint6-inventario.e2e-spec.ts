import { Test, TestingModule } from '@nestjs/testing';
import {
  AmbitoRol,
  EstadoVenta,
  EstrategiaInventario,
  TipoMovimientoInventario,
  UnidadInventario,
} from '@prisma/client';

import { PrismaService } from '../src/prisma/prisma.service';
import { VentasModule } from '../src/modulos/ventas/ventas.module';
import { VentasService } from '../src/modulos/ventas/ventas.service';
import { UsuarioAutenticado } from '../src/modulos/auth/types/usuario-autenticado.type';

describe('SPRINT 6 | Inventario operativo (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let ventasService: VentasService;

  const sufijo = `${Date.now().toString().slice(-8)}${Math.floor(
    Math.random() * 10000,
  )
    .toString()
    .padStart(4, '0')}`;

  let restauranteAId: number;
  let restauranteBId: number;
  let sucursalAId: number;
  let sucursalBId: number;
  let rolAId: number;
  let rolBId: number;
  let usuarioAId: number;
  let usuarioBId: number;
  let categoriaAId: number;
  let productoDirectoId: number;
  let productoRecetaId: number;
  let productoLibreId: number;
  let productoSinStockId: number;
  let articuloId: number;

  let usuarioA: UsuarioAutenticado;
  let usuarioB: UsuarioAutenticado;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [VentasModule],
    }).compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    ventasService = moduleRef.get(VentasService);

    const restauranteA = await prisma.restaurante.create({
      data: {
        nombre: `E2E Sprint6 A ${sufijo}`,
        nit: `E2EA${sufijo}`,
        estado: true,
      },
    });

    const restauranteB = await prisma.restaurante.create({
      data: {
        nombre: `E2E Sprint6 B ${sufijo}`,
        nit: `E2EB${sufijo}`,
        estado: true,
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
        clave: `E2E:${sufijo}:A`,
        nombre: `E2E_ADMIN_A_${sufijo}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: restauranteA.id,
      },
    });

    const rolB = await prisma.rol.create({
      data: {
        clave: `E2E:${sufijo}:B`,
        nombre: `E2E_ADMIN_B_${sufijo}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: restauranteB.id,
      },
    });

    rolAId = rolA.id;
    rolBId = rolB.id;

    const userA = await prisma.usuario.create({
      data: {
        nombres: 'E2E',
        apellidos: 'Sprint6 A',
        email: `e2e-s6-a-${sufijo}@sigr.local`,
        password: 'e2e-no-login',
        activo: true,
        rolId: rolA.id,
        restauranteId: restauranteA.id,
        sucursalId: sucursalA.id,
      },
    });

    const userB = await prisma.usuario.create({
      data: {
        nombres: 'E2E',
        apellidos: 'Sprint6 B',
        email: `e2e-s6-b-${sufijo}@sigr.local`,
        password: 'e2e-no-login',
        activo: true,
        rolId: rolB.id,
        restauranteId: restauranteB.id,
        sucursalId: sucursalB.id,
      },
    });

    usuarioAId = userA.id;
    usuarioBId = userB.id;

    usuarioA = {
      id: userA.id,
      email: userA.email,
      rolId: rolA.id,
      rol: rolA.nombre,
      restauranteId: restauranteA.id,
      sucursalId: sucursalA.id,
      permisos: [
        'VENTAS_CREAR',
        'VENTAS_VER',
        'VENTAS_ANULAR',
        'INVENTARIO_VER',
        'INVENTARIO_AJUSTAR',
      ],
      capacidades: ['INVENTARIO', 'RECETAS'],
    };

    usuarioB = {
      id: userB.id,
      email: userB.email,
      rolId: rolB.id,
      rol: rolB.nombre,
      restauranteId: restauranteB.id,
      sucursalId: sucursalB.id,
      permisos: ['VENTAS_CREAR'],
      capacidades: ['INVENTARIO', 'RECETAS'],
    };

    const categoria = await prisma.categoria.create({
      data: {
        nombre: `E2E Inventario ${sufijo}`,
        estado: true,
        sucursalId: sucursalA.id,
      },
    });

    categoriaAId = categoria.id;

    const productoDirecto = await prisma.producto.create({
      data: {
        nombre: `E2E Directo ${sufijo}`,
        precio: 10000,
        estrategiaInventario: EstrategiaInventario.STOCK_DIRECTO,
        unidadInventario: UnidadInventario.UNIDAD,
        stock: 10,
        estado: true,
        categoriaId: categoria.id,
      },
    });

    const productoReceta = await prisma.producto.create({
      data: {
        nombre: `E2E Receta ${sufijo}`,
        precio: 20000,
        estrategiaInventario: EstrategiaInventario.POR_RECETA,
        unidadInventario: UnidadInventario.UNIDAD,
        stock: 0,
        estado: true,
        categoriaId: categoria.id,
      },
    });

    const productoLibre = await prisma.producto.create({
      data: {
        nombre: `E2E Libre ${sufijo}`,
        precio: 5000,
        estrategiaInventario: EstrategiaInventario.NO_CONTROLAR,
        unidadInventario: UnidadInventario.UNIDAD,
        stock: 0,
        estado: true,
        categoriaId: categoria.id,
      },
    });

    const productoSinStock = await prisma.producto.create({
      data: {
        nombre: `E2E Sin Stock ${sufijo}`,
        precio: 7000,
        estrategiaInventario: EstrategiaInventario.STOCK_DIRECTO,
        unidadInventario: UnidadInventario.UNIDAD,
        stock: 1,
        estado: true,
        categoriaId: categoria.id,
      },
    });

    productoDirectoId = productoDirecto.id;
    productoRecetaId = productoReceta.id;
    productoLibreId = productoLibre.id;
    productoSinStockId = productoSinStock.id;

    const articulo = await prisma.articulo.create({
      data: {
        nombre: `E2E Carne ${sufijo}`,
        unidad: UnidadInventario.KG,
        costoUnidad: 25000,
        stock: 2,
        estado: true,
        sucursalId: sucursalA.id,
      },
    });

    articuloId = articulo.id;

    await prisma.receta.create({
      data: {
        productoId: productoReceta.id,
        articuloId: articulo.id,
        cantidad: 150,
        unidad: UnidadInventario.GR,
      },
    });
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      if (sucursalAId || sucursalBId) {
        const sucursales = [sucursalAId, sucursalBId].filter(Boolean);

        await prisma.movimientoInventario.deleteMany({
          where: {
            sucursalId: { in: sucursales },
            movimientoOrigenId: { not: null },
          },
        });

        await prisma.movimientoInventario.deleteMany({
          where: {
            sucursalId: { in: sucursales },
          },
        });
      }

      if (productoRecetaId) {
        await prisma.receta.deleteMany({
          where: {
            productoId: productoRecetaId,
          },
        });
      }

      if (usuarioAId || usuarioBId) {
        const usuarios = [usuarioAId, usuarioBId].filter(Boolean);

        const ventas = await prisma.venta.findMany({
          where: {
            usuarioId: { in: usuarios },
          },
          select: { id: true },
        });

        const ventaIds = ventas.map((venta) => venta.id);

        if (ventaIds.length > 0) {
          await prisma.detalleVenta.deleteMany({
            where: {
              ventaId: { in: ventaIds },
            },
          });

          await prisma.venta.deleteMany({
            where: {
              id: { in: ventaIds },
            },
          });
        }
      }

      if (categoriaAId) {
        await prisma.producto.deleteMany({
          where: {
            categoriaId: categoriaAId,
          },
        });
      }

      if (articuloId) {
        await prisma.articulo.deleteMany({
          where: {
            id: articuloId,
          },
        });
      }

      if (categoriaAId) {
        await prisma.categoria.deleteMany({
          where: {
            id: categoriaAId,
          },
        });
      }

      if (usuarioAId || usuarioBId) {
        await prisma.eventoAuditoria.deleteMany({
          where: {
            actorId: {
              in: [usuarioAId, usuarioBId].filter(Boolean),
            },
          },
        });
        await prisma.usuario.deleteMany({
          where: {
            id: {
              in: [usuarioAId, usuarioBId].filter(Boolean),
            },
          },
        });
      }

      if (rolAId || rolBId) {
        await prisma.rol.deleteMany({
          where: {
            id: {
              in: [rolAId, rolBId].filter(Boolean),
            },
          },
        });
      }

      if (sucursalAId || sucursalBId) {
        await prisma.sucursal.deleteMany({
          where: {
            id: {
              in: [sucursalAId, sucursalBId].filter(Boolean),
            },
          },
        });
      }

      if (restauranteAId || restauranteBId) {
        await prisma.restaurante.deleteMany({
          where: {
            id: {
              in: [restauranteAId, restauranteBId].filter(Boolean),
            },
          },
        });
      }
    }

    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  it('descuenta STOCK_DIRECTO y POR_RECETA, conserva NO_CONTROLAR y revierte por anulación', async () => {
    const venta = await ventasService.crearDirecta(
      {
        sucursalId: sucursalAId,
        detalles: [
          {
            productoId: productoDirectoId,
            cantidad: 2,
          },
          {
            productoId: productoRecetaId,
            cantidad: 2,
          },
          {
            productoId: productoLibreId,
            cantidad: 1,
          },
        ],
      },
      usuarioA,
      `s6-inventario-${sufijo}`,
    );

    const [directoTrasVenta, articuloTrasVenta, libreTrasVenta] =
      await Promise.all([
        prisma.producto.findUniqueOrThrow({
          where: { id: productoDirectoId },
        }),
        prisma.articulo.findUniqueOrThrow({
          where: { id: articuloId },
        }),
        prisma.producto.findUniqueOrThrow({
          where: { id: productoLibreId },
        }),
      ]);

    expect(directoTrasVenta.stock.toString()).toBe('8');
    expect(articuloTrasVenta.stock.toString()).toBe('1.7');
    expect(libreTrasVenta.stock.toString()).toBe('0');

    const salidas = await prisma.movimientoInventario.findMany({
      where: {
        ventaId: venta.id,
        tipo: TipoMovimientoInventario.SALIDA_VENTA,
      },
      orderBy: { id: 'asc' },
    });

    expect(salidas).toHaveLength(2);
    expect(salidas.some((m) => m.productoId === productoDirectoId)).toBe(true);
    expect(salidas.some((m) => m.articuloId === articuloId)).toBe(true);
    expect(salidas.some((m) => m.productoId === productoLibreId)).toBe(false);

    const anulada = await ventasService.anular(venta.id, usuarioA);
    expect(anulada.estado).toBe(EstadoVenta.ANULADA);

    const [directoRestaurado, articuloRestaurado] = await Promise.all([
      prisma.producto.findUniqueOrThrow({
        where: { id: productoDirectoId },
      }),
      prisma.articulo.findUniqueOrThrow({
        where: { id: articuloId },
      }),
    ]);

    expect(directoRestaurado.stock.toString()).toBe('10');
    expect(articuloRestaurado.stock.toString()).toBe('2');

    const reversos = await prisma.movimientoInventario.findMany({
      where: {
        ventaId: venta.id,
        tipo: TipoMovimientoInventario.REVERSO_VENTA,
      },
      orderBy: { id: 'asc' },
    });

    expect(reversos).toHaveLength(2);
    expect(reversos.every((m) => m.movimientoOrigenId !== null)).toBe(true);

    const origenes = new Set(salidas.map((m) => m.id));
    expect(
      reversos.every(
        (m) =>
          m.movimientoOrigenId !== null && origenes.has(m.movimientoOrigenId),
      ),
    ).toBe(true);

    const salidasDespues = await prisma.movimientoInventario.count({
      where: {
        ventaId: venta.id,
        tipo: TipoMovimientoInventario.SALIDA_VENTA,
      },
    });

    expect(salidasDespues).toBe(2);
  });

  it('revierte toda la transacción cuando el stock es insuficiente', async () => {
    const ventasAntes = await prisma.venta.count({
      where: { usuarioId: usuarioAId },
    });

    await expect(
      ventasService.crearDirecta(
        {
          sucursalId: sucursalAId,
          detalles: [
            {
              productoId: productoSinStockId,
              cantidad: 2,
            },
          ],
        },
        usuarioA,
        `s6-sin-stock-${sufijo}`,
      ),
    ).rejects.toThrow(/Stock insuficiente/);

    const [producto, ventasDespues, movimientos] = await Promise.all([
      prisma.producto.findUniqueOrThrow({
        where: { id: productoSinStockId },
      }),
      prisma.venta.count({
        where: { usuarioId: usuarioAId },
      }),
      prisma.movimientoInventario.count({
        where: { productoId: productoSinStockId },
      }),
    ]);

    expect(producto.stock.toString()).toBe('1');
    expect(ventasDespues).toBe(ventasAntes);
    expect(movimientos).toBe(0);
  });

  it('rechaza operar una sucursal de otro tenant', async () => {
    await expect(
      ventasService.crearDirecta(
        {
          sucursalId: sucursalAId,
          detalles: [
            {
              productoId: productoDirectoId,
              cantidad: 1,
            },
          ],
        },
        usuarioB,
        `s6-otro-tenant-${sufijo}`,
      ),
    ).rejects.toThrow('Sucursal no encontrada');

    const producto = await prisma.producto.findUniqueOrThrow({
      where: { id: productoDirectoId },
    });

    expect(producto.stock.toString()).toBe('10');
  });
});
