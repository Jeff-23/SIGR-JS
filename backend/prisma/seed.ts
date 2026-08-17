import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AmbitoRol } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PLANES = [
  {
    codigo: 'BASICO',
    nombre: 'Básico',
    descripcion: 'Plan inicial con el núcleo operativo de SIGR.',
  },
  {
    codigo: 'MEDIO',
    nombre: 'Medio',
    descripcion:
      'Plan para restaurantes que requieren operación digital de salón y clientes.',
  },
  {
    codigo: 'PRO',
    nombre: 'Pro',
    descripcion:
      'Plan avanzado con operación integral, inventario, cocina y analítica.',
  },
  {
    codigo: 'ENTERPRISE',
    nombre: 'Enterprise',
    descripcion:
      'Plan empresarial con todas las capacidades y soporte multisucursal.',
  },
] as const;

const CAPACIDADES = [
  {
    codigo: 'MESAS',
    nombre: 'Gestión de mesas',
    modulo: 'MESAS',
    descripcion: 'Habilita la operación visual y digital de mesas.',
  },
  {
    codigo: 'KDS',
    nombre: 'Sistema de cocina KDS',
    modulo: 'COCINA',
    descripcion: 'Habilita comandas y operación de cocina en tiempo real.',
  },
  {
    codigo: 'INVENTARIO',
    nombre: 'Inventario',
    modulo: 'INVENTARIO',
    descripcion: 'Habilita el control de inventario del restaurante.',
  },
  {
    codigo: 'RECETAS',
    nombre: 'Recetas',
    modulo: 'INVENTARIO',
    descripcion:
      'Habilita recetas y consumo de inventario por composición de productos.',
  },
  {
    codigo: 'CLIENTES',
    nombre: 'Clientes',
    modulo: 'CLIENTES',
    descripcion:
      'Habilita gestión de clientes e historial comercial.',
  },
  {
    codigo: 'MULTICAJA',
    nombre: 'Múltiples cajas',
    modulo: 'CAJA',
    descripcion:
      'Permite operar múltiples cajas de forma independiente.',
  },
  {
    codigo: 'ANALYTICS',
    nombre: 'Analítica avanzada',
    modulo: 'REPORTES',
    descripcion:
      'Habilita indicadores, estadísticas y análisis avanzados.',
  },
  {
    codigo: 'MULTISUCURSAL',
    nombre: 'Múltiples sucursales',
    modulo: 'ORGANIZACION',
    descripcion:
      'Permite administrar múltiples sucursales del mismo restaurante.',
  },
  {
    codigo: 'CATALOGO_VISUAL',
    nombre: 'Catálogo visual',
    modulo: 'PRODUCTOS',
    descripcion:
      'Habilita imágenes de productos y modo visual para tablets y POS.',
  },
] as const;

const CAPACIDADES_POR_PLAN: Record<string, string[]> = {
  BASICO: [],

  MEDIO: [
    'MESAS',
    'CLIENTES',
  ],

  PRO: [
    'MESAS',
    'KDS',
    'INVENTARIO',
    'RECETAS',
    'CLIENTES',
    'MULTICAJA',
    'ANALYTICS',
    'CATALOGO_VISUAL',
  ],

  ENTERPRISE: [
    'MESAS',
    'KDS',
    'INVENTARIO',
    'RECETAS',
    'CLIENTES',
    'MULTICAJA',
    'ANALYTICS',
    'MULTISUCURSAL',
    'CATALOGO_VISUAL',
  ],
};

const PERMISOS = [
  // Usuarios
  {
    codigo: 'USUARIOS_VER',
    nombre: 'Ver usuarios',
    modulo: 'USUARIOS',
  },
  {
    codigo: 'USUARIOS_CREAR',
    nombre: 'Crear usuarios',
    modulo: 'USUARIOS',
  },
  {
    codigo: 'USUARIOS_EDITAR',
    nombre: 'Editar usuarios',
    modulo: 'USUARIOS',
  },
  {
    codigo: 'USUARIOS_DESACTIVAR',
    nombre: 'Activar o desactivar usuarios',
    modulo: 'USUARIOS',
  },

  // Sucursales
  {
    codigo: 'SUCURSALES_VER',
    nombre: 'Ver sucursales',
    modulo: 'SUCURSALES',
  },
  {
    codigo: 'SUCURSALES_CREAR',
    nombre: 'Crear sucursales',
    modulo: 'SUCURSALES',
  },
  {
    codigo: 'SUCURSALES_EDITAR',
    nombre: 'Editar sucursales',
    modulo: 'SUCURSALES',
  },

  // Zonas
  {
    codigo: 'ZONAS_VER',
    nombre: 'Ver zonas',
    modulo: 'ZONAS',
  },
  {
    codigo: 'ZONAS_CREAR',
    nombre: 'Crear zonas',
    modulo: 'ZONAS',
  },
  {
    codigo: 'ZONAS_EDITAR',
    nombre: 'Editar zonas',
    modulo: 'ZONAS',
  },

  // Mesas
  {
    codigo: 'MESAS_VER',
    nombre: 'Ver mesas',
    modulo: 'MESAS',
  },
  {
    codigo: 'MESAS_CREAR',
    nombre: 'Crear mesas',
    modulo: 'MESAS',
  },
  {
    codigo: 'MESAS_EDITAR',
    nombre: 'Editar mesas',
    modulo: 'MESAS',
  },

  // Categorías
  {
    codigo: 'CATEGORIAS_VER',
    nombre: 'Ver categorías',
    modulo: 'PRODUCTOS',
  },
  {
    codigo: 'CATEGORIAS_CREAR',
    nombre: 'Crear categorías',
    modulo: 'PRODUCTOS',
  },
  {
    codigo: 'CATEGORIAS_EDITAR',
    nombre: 'Editar categorías',
    modulo: 'PRODUCTOS',
  },

  // Productos
  {
    codigo: 'PRODUCTOS_VER',
    nombre: 'Ver productos',
    modulo: 'PRODUCTOS',
  },
  {
    codigo: 'PRODUCTOS_CREAR',
    nombre: 'Crear productos',
    modulo: 'PRODUCTOS',
  },
  {
    codigo: 'PRODUCTOS_EDITAR',
    nombre: 'Editar productos',
    modulo: 'PRODUCTOS',
  },

  // Inventario
  {
    codigo: 'INVENTARIO_VER',
    nombre: 'Ver inventario',
    modulo: 'INVENTARIO',
  },
  {
    codigo: 'INVENTARIO_AJUSTAR',
    nombre: 'Ajustar inventario',
    modulo: 'INVENTARIO',
  },

  // Recetas
  {
    codigo: 'RECETAS_VER',
    nombre: 'Ver recetas',
    modulo: 'RECETAS',
  },
  {
    codigo: 'RECETAS_CREAR',
    nombre: 'Crear recetas',
    modulo: 'RECETAS',
  },
  {
    codigo: 'RECETAS_EDITAR',
    nombre: 'Editar recetas',
    modulo: 'RECETAS',
  },

  // Pedidos
  {
    codigo: 'PEDIDOS_VER',
    nombre: 'Ver pedidos',
    modulo: 'PEDIDOS',
  },
  {
    codigo: 'PEDIDOS_CREAR',
    nombre: 'Crear pedidos',
    modulo: 'PEDIDOS',
  },
  {
    codigo: 'PEDIDOS_EDITAR',
    nombre: 'Editar pedidos',
    modulo: 'PEDIDOS',
  },
  {
    codigo: 'PEDIDOS_CANCELAR',
    nombre: 'Cancelar pedidos',
    modulo: 'PEDIDOS',
  },

  // Facturación
  {
    codigo: 'FACTURAS_VER',
    nombre: 'Ver facturas',
    modulo: 'FACTURACION',
  },
  {
    codigo: 'FACTURAS_EMITIR',
    nombre: 'Emitir facturas',
    modulo: 'FACTURACION',
  },
  {
    codigo: 'FACTURAS_ANULAR',
    nombre: 'Anular facturas',
    modulo: 'FACTURACION',
  },

  // Pagos
  {
    codigo: 'PAGOS_REGISTRAR',
    nombre: 'Registrar pagos',
    modulo: 'PAGOS',
  },

  // Métodos de pago
  {
    codigo: 'METODOS_PAGO_VER',
    nombre: 'Ver métodos de pago',
    modulo: 'PAGOS',
  },
  {
    codigo: 'METODOS_PAGO_GESTIONAR',
    nombre: 'Gestionar métodos de pago',
    modulo: 'PAGOS',
  },

  // Caja
  {
    codigo: 'CAJA_ABRIR',
    nombre: 'Abrir caja',
    modulo: 'CAJA',
  },
  {
    codigo: 'CAJA_CERRAR',
    nombre: 'Cerrar caja',
    modulo: 'CAJA',
  },
  {
    codigo: 'CAJA_MOVIMIENTOS',
    nombre: 'Registrar movimientos de caja',
    modulo: 'CAJA',
  },

  // Ventas
  {
    codigo: 'DESCUENTOS_APLICAR',
    nombre: 'Aplicar descuentos',
    modulo: 'VENTAS',
  },

  // Reportes
  {
    codigo: 'REPORTES_VER',
    nombre: 'Ver reportes',
    modulo: 'REPORTES',
  },
] as const;

async function bootstrap() {
  console.log('Iniciando seed de SIGR...');

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      'La variable SEED_ADMIN_PASSWORD no está configurada en backend/.env',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    // ==========================================
    // 1. PLANES
    // ==========================================

    const planesPorCodigo = new Map<string, number>();

    for (const plan of PLANES) {
      const registro = await prisma.plan.upsert({
        where: {
          codigo: plan.codigo,
        },
        update: {
          nombre: plan.nombre,
          descripcion: plan.descripcion,
          activo: true,
        },
        create: {
          codigo: plan.codigo,
          nombre: plan.nombre,
          descripcion: plan.descripcion,
        },
      });

      planesPorCodigo.set(registro.codigo, registro.id);
    }

    console.log(`${PLANES.length} planes configurados.`);

    // ==========================================
    // 2. CAPACIDADES
    // ==========================================

    const capacidadesPorCodigo = new Map<string, number>();

    for (const capacidad of CAPACIDADES) {
      const registro = await prisma.capacidad.upsert({
        where: {
          codigo: capacidad.codigo,
        },
        update: {
          nombre: capacidad.nombre,
          descripcion: capacidad.descripcion,
          modulo: capacidad.modulo,
          activo: true,
        },
        create: {
          codigo: capacidad.codigo,
          nombre: capacidad.nombre,
          descripcion: capacidad.descripcion,
          modulo: capacidad.modulo,
        },
      });

      capacidadesPorCodigo.set(registro.codigo, registro.id);
    }

    console.log(`${CAPACIDADES.length} capacidades configuradas.`);

    // ==========================================
    // 3. MATRIZ PLAN -> CAPACIDADES
    // ==========================================

    for (const [codigoPlan, codigosCapacidades] of Object.entries(
      CAPACIDADES_POR_PLAN,
    )) {
      const planId = planesPorCodigo.get(codigoPlan);

      if (!planId) {
        throw new Error(`No se encontró el plan ${codigoPlan}`);
      }

      // La matriz del seed es la fuente de verdad.
      await prisma.planCapacidad.deleteMany({
        where: {
          planId,
        },
      });

      for (const codigoCapacidad of codigosCapacidades) {
        const capacidadId = capacidadesPorCodigo.get(codigoCapacidad);

        if (!capacidadId) {
          throw new Error(
            `No se encontró la capacidad ${codigoCapacidad}`,
          );
        }

        await prisma.planCapacidad.create({
          data: {
            planId,
            capacidadId,
          },
        });
      }
    }

    console.log('Matriz de capacidades por plan configurada.');

    // ==========================================
    // 4. PERMISOS GRANULARES
    // ==========================================

    for (const permiso of PERMISOS) {
      await prisma.permiso.upsert({
        where: {
          codigo: permiso.codigo,
        },
        update: {
          nombre: permiso.nombre,
          modulo: permiso.modulo,
          activo: true,
        },
        create: {
          codigo: permiso.codigo,
          nombre: permiso.nombre,
          modulo: permiso.modulo,
        },
      });
    }

    console.log(`${PERMISOS.length} permisos configurados.`);

          // ==========================================
    // 5. SUPERADMIN GLOBAL DE SIGR
    // ==========================================

    const rolSuperadmin =
      await prisma.rol.upsert({
        where: {
          clave: 'SISTEMA:SUPERADMIN',
        },

        update: {
          nombre: 'SUPERADMIN',
          descripcion:
            'Superadministrador global de la plataforma SIGR',
          ambito: AmbitoRol.SISTEMA,
          restauranteId: null,
        },

        create: {
          clave: 'SISTEMA:SUPERADMIN',
          nombre: 'SUPERADMIN',
          descripcion:
            'Superadministrador global de la plataforma SIGR',
          ambito: AmbitoRol.SISTEMA,
          restauranteId: null,
        },
      });

    console.log(
      'Rol SUPERADMIN global configurado.',
    );

    // ==========================================
    // 6. ADMINISTRADORES POR RESTAURANTE
    // ==========================================

    const restaurantes =
      await prisma.restaurante.findMany({
        select: {
          id: true,
          nombre: true,
        },

        orderBy: {
          id: 'asc',
        },
      });

      const permisosAdmin =
  await prisma.permiso.findMany({
    where: {
      activo: true,
    },

    select: {
      id: true,
      codigo: true,
    },

    orderBy: {
      id: 'asc',
    },
  });

console.log(
  `${permisosAdmin.length} permisos disponibles para roles ADMIN.`,
);

    for (const restaurante of restaurantes) {
  const claveAdmin =
    `RESTAURANTE:${restaurante.id}:ADMIN`;

  const rolAdminRestaurante =
    await prisma.rol.upsert({
      where: {
        clave: claveAdmin,
      },

      update: {
        nombre: 'ADMIN',
        descripcion:
          `Administrador del restaurante ${restaurante.nombre}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: restaurante.id,
      },

      create: {
        clave: claveAdmin,
        nombre: 'ADMIN',
        descripcion:
          `Administrador del restaurante ${restaurante.nombre}`,
        ambito: AmbitoRol.RESTAURANTE,
        restauranteId: restaurante.id,
      },
    });

  // ==========================================
  // PERMISOS DEL ADMIN DEL RESTAURANTE
  // ==========================================

  await prisma.rolPermiso.deleteMany({
    where: {
      rolId: rolAdminRestaurante.id,
    },
  });

  if (permisosAdmin.length > 0) {
    await prisma.rolPermiso.createMany({
      data: permisosAdmin.map(
        (permiso) => ({
          rolId: rolAdminRestaurante.id,
          permisoId: permiso.id,
        }),
      ),
    });
  }

  console.log(
    `${permisosAdmin.length} permisos asignados al ADMIN de ${restaurante.nombre}.`,
  );

  // Migración heredada de usuarios.
  const resultado =
    await prisma.usuario.updateMany({
      where: {
        restauranteId: restaurante.id,
        rolId: rolSuperadmin.id,
      },

      data: {
        rolId: rolAdminRestaurante.id,
      },
    });

  console.log(
    `Rol ADMIN configurado para ${restaurante.nombre}. ` +
      `Usuarios migrados: ${resultado.count}`,
  );
}

    // ==========================================
    // 7. SUPERADMIN PRINCIPAL
    // ==========================================

    const passwordHasheada =
      await bcrypt.hash(adminPassword, 10);

    const admin =
      await prisma.usuario.upsert({
        where: {
          email: 'admin@sigr.com',
        },

        update: {
          rolId: rolSuperadmin.id,
          restauranteId: null,
          sucursalId: null,
          activo: true,
        },

        create: {
          nombres: 'Super',
          apellidos: 'Administrador',
          email: 'admin@sigr.com',
          password: passwordHasheada,
          rolId: rolSuperadmin.id,
          restauranteId: null,
          sucursalId: null,
          activo: true,
        },
      });

    console.log(
      `Superadministrador verificado: ${admin.email}`,
    );

    console.log('Seed de SIGR completado correctamente.');
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Error ejecutando el seed de SIGR:', error);
  process.exit(1);
});