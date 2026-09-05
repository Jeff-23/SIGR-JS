import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import {
  AmbitoRol,
  EstrategiaInventario,
  Prisma,
  UnidadInventario,
} from '@prisma/client';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type ProductoPrueba = {
  nombre: string;
  categoria: string;
  precio: number;
  estacion: 'COCINA' | 'BAR';
  favorito?: boolean;
  stock?: number;
};

type SucursalPrueba = {
  nombre: string;
  direccion: string;
  mesas: number;
  productos: ProductoPrueba[];
};

type RestaurantePrueba = {
  nit: string;
  nombre: string;
  plan: 'BASICO' | 'MEDIO' | 'PRO';
  direccion: string;
  telefono: string;
  correo: string;
  sucursales: SucursalPrueba[];
};

const DOMINIO = 'cert.sigr.example';

const RESTAURANTES: RestaurantePrueba[] = [
  {
    nit: '900900101-1',
    nombre: 'Restaurante Costy',
    plan: 'BASICO',
    direccion: 'Cartagena, Bolívar',
    telefono: '3000000101',
    correo: `contacto.costy@${DOMINIO}`,
    sucursales: [
      {
        nombre: 'Sede Principal',
        direccion: 'Cartagena, Bolívar',
        mesas: 12,
        productos: [
          {
            nombre: 'Perro Costy',
            categoria: 'Perros calientes',
            precio: 18000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Perro Especial',
            categoria: 'Perros calientes',
            precio: 24000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Arepa de carne',
            categoria: 'Arepas',
            precio: 16000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Arepa mixta',
            categoria: 'Arepas',
            precio: 19000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Patacón pollo',
            categoria: 'Patacones',
            precio: 22000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Patacón mixto',
            categoria: 'Patacones',
            precio: 26000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Hamburguesa clásica',
            categoria: 'Hamburguesas',
            precio: 23000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Picada Costy',
            categoria: 'Picadas y asados',
            precio: 52000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Almuerzo ejecutivo',
            categoria: 'Almuerzos',
            precio: 20000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Limonada natural',
            categoria: 'Bebidas',
            precio: 7000,
            estacion: 'BAR',
          },
          {
            nombre: 'Gaseosa personal',
            categoria: 'Bebidas',
            precio: 6000,
            estacion: 'BAR',
            stock: 80,
          },
          {
            nombre: 'Agua',
            categoria: 'Bebidas',
            precio: 5000,
            estacion: 'BAR',
            stock: 80,
          },
        ],
      },
    ],
  },
  {
    nit: '900900202-2',
    nombre: 'Restaurante Sazón Urbano',
    plan: 'MEDIO',
    direccion: 'Cartagena, Bolívar',
    telefono: '3000000202',
    correo: `contacto.sazon@${DOMINIO}`,
    sucursales: [
      {
        nombre: 'Bocagrande',
        direccion: 'Bocagrande, Cartagena',
        mesas: 15,
        productos: [
          {
            nombre: 'Ceviche urbano',
            categoria: 'Entradas',
            precio: 28000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Arroz marinero',
            categoria: 'Platos de mar',
            precio: 48000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Salmón caribe',
            categoria: 'Platos de mar',
            precio: 52000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Pasta de camarón',
            categoria: 'Platos fuertes',
            precio: 43000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Hamburguesa Sazón',
            categoria: 'Platos fuertes',
            precio: 32000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Mojito clásico',
            categoria: 'Coctelería',
            precio: 24000,
            estacion: 'BAR',
            favorito: true,
          },
          {
            nombre: 'Gin tropical',
            categoria: 'Coctelería',
            precio: 29000,
            estacion: 'BAR',
          },
          {
            nombre: 'Limonada de coco',
            categoria: 'Bebidas',
            precio: 12000,
            estacion: 'BAR',
            favorito: true,
          },
          {
            nombre: 'Cerveza nacional',
            categoria: 'Bebidas',
            precio: 10000,
            estacion: 'BAR',
            stock: 120,
          },
        ],
      },
      {
        nombre: 'Manga',
        direccion: 'Manga, Cartagena',
        mesas: 15,
        productos: [
          {
            nombre: 'Sopa del día',
            categoria: 'Almuerzos',
            precio: 12000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Almuerzo urbano',
            categoria: 'Almuerzos',
            precio: 26000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Pechuga parrilla',
            categoria: 'Parrilla',
            precio: 34000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Churrasco',
            categoria: 'Parrilla',
            precio: 44000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Hamburguesa Manga',
            categoria: 'Comidas rápidas',
            precio: 28000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Jugo natural',
            categoria: 'Bebidas',
            precio: 8000,
            estacion: 'BAR',
          },
          {
            nombre: 'Limonada hierbabuena',
            categoria: 'Bebidas',
            precio: 9000,
            estacion: 'BAR',
          },
          {
            nombre: 'Cerveza nacional',
            categoria: 'Bebidas',
            precio: 9000,
            estacion: 'BAR',
            stock: 90,
          },
        ],
      },
    ],
  },
  {
    nit: '900900303-3',
    nombre: 'Restaurante Sabores Colombianos',
    plan: 'PRO',
    direccion: 'Cartagena, Bolívar',
    telefono: '3000000303',
    correo: `contacto.sabores@${DOMINIO}`,
    sucursales: [
      {
        nombre: 'Bacuyande',
        direccion: 'Cartagena, Bolívar',
        mesas: 15,
        productos: [
          {
            nombre: 'Cazuela de mariscos',
            categoria: 'Mar y costa',
            precio: 59000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Pargo frito',
            categoria: 'Mar y costa',
            precio: 54000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Arroz con camarón',
            categoria: 'Mar y costa',
            precio: 46000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Ceviche colombiano',
            categoria: 'Entradas',
            precio: 30000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Patacones con hogao',
            categoria: 'Entradas',
            precio: 16000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Limonada de coco',
            categoria: 'Bebidas',
            precio: 13000,
            estacion: 'BAR',
            favorito: true,
          },
          {
            nombre: 'Cerveza artesanal',
            categoria: 'Bebidas',
            precio: 14000,
            estacion: 'BAR',
            stock: 100,
          },
        ],
      },
      {
        nombre: 'Centro',
        direccion: 'Centro Histórico, Cartagena',
        mesas: 15,
        productos: [
          {
            nombre: 'Calentado colombiano',
            categoria: 'Desayunos',
            precio: 24000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Arepa con huevo',
            categoria: 'Desayunos',
            precio: 12000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Bandeja costeña',
            categoria: 'Almuerzos',
            precio: 36000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Sancocho del día',
            categoria: 'Almuerzos',
            precio: 30000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Posta cartagenera',
            categoria: 'Tradicionales',
            precio: 44000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Jugo de corozo',
            categoria: 'Bebidas',
            precio: 9000,
            estacion: 'BAR',
          },
          {
            nombre: 'Café colombiano',
            categoria: 'Bebidas',
            precio: 6000,
            estacion: 'BAR',
          },
        ],
      },
      {
        nombre: 'Castellana',
        direccion: 'La Castellana, Cartagena',
        mesas: 15,
        productos: [
          {
            nombre: 'Hamburguesa colombiana',
            categoria: 'Comidas rápidas',
            precio: 30000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Perro costeño',
            categoria: 'Comidas rápidas',
            precio: 22000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Picada para dos',
            categoria: 'Picadas',
            precio: 60000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Almuerzo de la casa',
            categoria: 'Almuerzos',
            precio: 27000,
            estacion: 'COCINA',
            favorito: true,
          },
          {
            nombre: 'Pechuga gratinada',
            categoria: 'Almuerzos',
            precio: 35000,
            estacion: 'COCINA',
          },
          {
            nombre: 'Malteada',
            categoria: 'Bebidas',
            precio: 14000,
            estacion: 'BAR',
          },
          {
            nombre: 'Gaseosa personal',
            categoria: 'Bebidas',
            precio: 6000,
            estacion: 'BAR',
            stock: 120,
          },
        ],
      },
    ],
  },
];

const PERMISOS_ROL: Record<string, string[]> = {
  ADMIN_SEDE: [
    'USUARIOS_VER',
    'SUCURSALES_VER',
    'ZONAS_VER',
    'ZONAS_CREAR',
    'ZONAS_EDITAR',
    'MESAS_VER',
    'MESAS_CREAR',
    'MESAS_EDITAR',
    'CATEGORIAS_VER',
    'CATEGORIAS_CREAR',
    'CATEGORIAS_EDITAR',
    'PRODUCTOS_VER',
    'PRODUCTOS_CREAR',
    'PRODUCTOS_EDITAR',
    'INVENTARIO_VER',
    'INVENTARIO_AJUSTAR',
    'RECETAS_VER',
    'RECETAS_CREAR',
    'RECETAS_EDITAR',
    'PEDIDOS_VER',
    'PEDIDOS_CREAR',
    'PEDIDOS_EDITAR',
    'PEDIDOS_CANCELAR',
    'COMANDAS_VER',
    'COMANDAS_ENVIAR',
    'COMANDAS_ACTUALIZAR_ESTADO',
    'VENTAS_VER',
    'VENTAS_CREAR',
    'VENTAS_REGISTRAR_MANUAL',
    'VENTAS_ANULAR',
    'FACTURAS_VER',
    'FACTURAS_EMITIR',
    'REGISTROS_FACTURA_VER',
    'REGISTROS_FACTURA_CREAR',
    'REGISTROS_FACTURA_EXPORTAR',
    'PAGOS_REGISTRAR',
    'METODOS_PAGO_VER',
    'CAJA_VER',
    'CAJA_ABRIR',
    'CAJA_CERRAR',
    'CAJA_MOVIMIENTOS',
    'DESCUENTOS_APLICAR',
    'CLIENTES_VER',
    'CLIENTES_CREAR',
    'CLIENTES_EDITAR',
    'CENTRO_OPERATIVO_VER',
    'REPORTES_VER',
    'CONFIGURACION_VER',
    'AUDITORIA_VER',
  ],
  CAJERO: [
    'MESAS_VER',
    'PEDIDOS_VER',
    'VENTAS_VER',
    'VENTAS_CREAR',
    'VENTAS_REGISTRAR_MANUAL',
    'FACTURAS_VER',
    'FACTURAS_EMITIR',
    'REGISTROS_FACTURA_VER',
    'REGISTROS_FACTURA_CREAR',
    'PAGOS_REGISTRAR',
    'METODOS_PAGO_VER',
    'CAJA_VER',
    'CAJA_ABRIR',
    'CAJA_CERRAR',
    'CAJA_MOVIMIENTOS',
    'DESCUENTOS_APLICAR',
    'CLIENTES_VER',
    'CLIENTES_CREAR',
    'CENTRO_OPERATIVO_VER',
  ],
  MESERO: [
    'MESAS_VER',
    'PEDIDOS_VER',
    'PEDIDOS_CREAR',
    'PEDIDOS_EDITAR',
    'COMANDAS_VER',
    'COMANDAS_ENVIAR',
    'CLIENTES_VER',
    'CLIENTES_CREAR',
    'CENTRO_OPERATIVO_VER',
  ],
  COCINA: [
    'PEDIDOS_VER',
    'COMANDAS_VER',
    'COMANDAS_ACTUALIZAR_ESTADO',
    'CENTRO_OPERATIVO_VER',
  ],
  BAR: [
    'PEDIDOS_VER',
    'COMANDAS_VER',
    'COMANDAS_ACTUALIZAR_ESTADO',
    'CENTRO_OPERATIVO_VER',
  ],
  DOMICILIARIO: ['PEDIDOS_VER'],
  INVENTARIO: [
    'CATEGORIAS_VER',
    'PRODUCTOS_VER',
    'INVENTARIO_VER',
    'INVENTARIO_AJUSTAR',
    'RECETAS_VER',
    'RECETAS_CREAR',
    'RECETAS_EDITAR',
    'REPORTES_VER',
  ],
  CONTADOR: [
    'REGISTROS_FACTURA_VER',
    'REGISTROS_FACTURA_EXPORTAR',
    'FACTURAS_VER',
    'REPORTES_VER',
    'CAJA_VER',
    'AUDITORIA_VER',
  ],
};

function usuariosPorRestaurante(restaurante: string, sucursal: string) {
  const key = `${restaurante}-${sucursal}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.');
  return {
    adminSede: `admin.${key}@${DOMINIO}`,
    cajero: `caja.${key}@${DOMINIO}`,
    mesero: `mesero.${key}@${DOMINIO}`,
    cocina: `cocina.${key}@${DOMINIO}`,
    bar: `bar.${key}@${DOMINIO}`,
    domicilio: `domicilio.${key}@${DOMINIO}`,
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'El seed de certificación no puede ejecutarse con NODE_ENV=production.',
    );
  }

  const testPassword = process.env.CERTIFICATION_TEST_PASSWORD;
  if (!testPassword || testPassword.length < 10) {
    throw new Error(
      'Configura CERTIFICATION_TEST_PASSWORD con al menos 10 caracteres.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    const planes = new Map(
      (await prisma.plan.findMany()).map((plan) => [plan.codigo, plan.id]),
    );
    const permisos = new Map(
      (await prisma.permiso.findMany({ where: { activo: true } })).map((p) => [
        p.codigo,
        p.id,
      ]),
    );
    const password = await bcrypt.hash(testPassword, 10);

    for (const codigo of ['BASICO', 'MEDIO', 'PRO']) {
      if (!planes.has(codigo))
        throw new Error(
          `Falta el plan ${codigo}. Ejecuta primero npm run db:seed.`,
        );
    }

    for (const lista of Object.values(PERMISOS_ROL)) {
      for (const codigo of lista) {
        if (!permisos.has(codigo))
          throw new Error(
            `Falta el permiso ${codigo}. Ejecuta primero npm run db:seed.`,
          );
      }
    }

    for (const definicion of RESTAURANTES) {
      const restaurante = await prisma.restaurante.upsert({
        where: { nit: definicion.nit },
        update: {
          nombre: definicion.nombre,
          direccion: definicion.direccion,
          telefono: definicion.telefono,
          correo: definicion.correo,
          estado: true,
          planId: planes.get(definicion.plan),
        },
        create: {
          nit: definicion.nit,
          nombre: definicion.nombre,
          direccion: definicion.direccion,
          telefono: definicion.telefono,
          correo: definicion.correo,
          estado: true,
          planId: planes.get(definicion.plan),
        },
      });

      await prisma.configuracionRestaurante.upsert({
        where: {
          restauranteId_clave: {
            restauranteId: restaurante.id,
            clave: 'MONEDA',
          },
        },
        update: { valor: 'COP' },
        create: {
          restauranteId: restaurante.id,
          clave: 'MONEDA',
          valor: 'COP',
        },
      });
      await prisma.configuracionRestaurante.upsert({
        where: {
          restauranteId_clave: {
            restauranteId: restaurante.id,
            clave: 'ZONA_HORARIA',
          },
        },
        update: { valor: 'America/Bogota' },
        create: {
          restauranteId: restaurante.id,
          clave: 'ZONA_HORARIA',
          valor: 'America/Bogota',
        },
      });

      const rolAdmin = await asegurarRol(
        prisma,
        restaurante.id,
        'ADMIN',
        'Administrador general del restaurante',
        permisos,
        [...permisos.keys()],
      );
      for (const [nombre, codigos] of Object.entries(PERMISOS_ROL)) {
        await asegurarRol(
          prisma,
          restaurante.id,
          nombre,
          `Rol de certificación ${nombre}`,
          permisos,
          codigos,
        );
      }

      await asegurarUsuario(prisma, {
        email: `admin.${slug(definicion.nombre)}@${DOMINIO}`,
        nombres: 'Administrador',
        apellidos: definicion.nombre.replace('Restaurante ', ''),
        password,
        rolId: rolAdmin.id,
        restauranteId: restaurante.id,
        sucursalId: null,
      });

      for (const sede of definicion.sucursales) {
        const sucursal = await asegurarSucursal(
          prisma,
          restaurante.id,
          sede.nombre,
          sede.direccion,
        );
        await asegurarConfiguracionSucursal(prisma, sucursal.id);

        const cocina = await asegurarEstacion(
          prisma,
          sucursal.id,
          'COCINA',
          'Cocina',
          '#F97316',
          10,
        );
        const bar = await asegurarEstacion(
          prisma,
          sucursal.id,
          'BAR',
          'Bar',
          '#3B82F6',
          20,
        );
        const zona = await asegurarZona(prisma, sucursal.id, 'Salón principal');
        for (let numero = 1; numero <= sede.mesas; numero += 1) {
          await asegurarMesa(prisma, zona.id, String(numero));
        }

        const categorias = new Map<string, number>();
        for (const producto of sede.productos) {
          if (!categorias.has(producto.categoria)) {
            const categoria = await asegurarCategoria(
              prisma,
              sucursal.id,
              producto.categoria,
            );
            categorias.set(producto.categoria, categoria.id);
          }
          await asegurarProducto(prisma, {
            categoriaId: categorias.get(producto.categoria),
            estacionId: producto.estacion === 'COCINA' ? cocina.id : bar.id,
            nombre: producto.nombre,
            precio: producto.precio,
            favorito: producto.favorito ?? false,
            stock: producto.stock,
          });
        }

        const emails = usuariosPorRestaurante(definicion.nombre, sede.nombre);
        const roles = await prisma.rol.findMany({
          where: { restauranteId: restaurante.id },
        });
        const roleId = (nombre: string) => {
          const rol = roles.find((item) => item.nombre === nombre);
          if (!rol)
            throw new Error(
              `No existe el rol ${nombre} para ${definicion.nombre}`,
            );
          return rol.id;
        };
        const usuarios = [
          ['ADMIN_SEDE', emails.adminSede, 'Administrador', sede.nombre],
          ['CAJERO', emails.cajero, 'Cajero', sede.nombre],
          ['MESERO', emails.mesero, 'Mesero', sede.nombre],
          ['COCINA', emails.cocina, 'Cocina', sede.nombre],
          ['BAR', emails.bar, 'Bar', sede.nombre],
          ['DOMICILIARIO', emails.domicilio, 'Domiciliario', sede.nombre],
        ] as const;
        for (const [rol, email, nombres, apellidos] of usuarios) {
          await asegurarUsuario(prisma, {
            email,
            nombres,
            apellidos,
            password,
            rolId: roleId(rol),
            restauranteId: restaurante.id,
            sucursalId: sucursal.id,
          });
        }
      }

      await asegurarUsuario(prisma, {
        email: `contador.${slug(definicion.nombre)}@${DOMINIO}`,
        nombres: 'Contador',
        apellidos: definicion.nombre.replace('Restaurante ', ''),
        password,
        rolId: (
          await prisma.rol.findUniqueOrThrow({
            where: { clave: `RESTAURANTE:${restaurante.id}:CONTADOR` },
          })
        ).id,
        restauranteId: restaurante.id,
        sucursalId: null,
      });
    }

    console.log(
      'Certificación multiempresa lista: 3 restaurantes, 6 sucursales y usuarios por rol.',
    );
    console.log(`Dominio de usuarios ficticios: @${DOMINIO}`);
    console.log(
      'La contraseña no se imprime; se toma de CERTIFICATION_TEST_PASSWORD.',
    );
  } finally {
    await app.close();
  }
}

async function asegurarRol(
  prisma: PrismaService,
  restauranteId: number,
  nombre: string,
  descripcion: string,
  permisos: Map<string, number>,
  codigos: string[],
) {
  const clave = `RESTAURANTE:${restauranteId}:${nombre}`;
  const rol = await prisma.rol.upsert({
    where: { clave },
    update: {
      nombre,
      descripcion,
      ambito: AmbitoRol.RESTAURANTE,
      restauranteId,
    },
    create: {
      clave,
      nombre,
      descripcion,
      ambito: AmbitoRol.RESTAURANTE,
      restauranteId,
    },
  });
  await prisma.rolPermiso.deleteMany({ where: { rolId: rol.id } });
  if (codigos.length) {
    await prisma.rolPermiso.createMany({
      data: codigos.map((codigo) => ({
        rolId: rol.id,
        permisoId: permisos.get(codigo),
      })),
    });
  }
  return rol;
}

async function asegurarSucursal(
  prisma: PrismaService,
  restauranteId: number,
  nombre: string,
  direccion: string,
) {
  const actual = await prisma.sucursal.findFirst({
    where: { restauranteId, nombre },
  });
  if (actual)
    return prisma.sucursal.update({
      where: { id: actual.id },
      data: { direccion, estado: true },
    });
  return prisma.sucursal.create({
    data: { restauranteId, nombre, direccion, estado: true },
  });
}

async function asegurarConfiguracionSucursal(
  prisma: PrismaService,
  sucursalId: number,
) {
  const valores: Array<[string, Prisma.InputJsonValue]> = [
    ['ZONA_HORARIA', 'America/Bogota'],
    ['MONEDA', 'COP'],
    ['PORCENTAJE_IMPUESTO', 0],
    ['QR_REQUIERE_ACEPTACION', true],
  ];
  for (const [clave, valor] of valores) {
    await prisma.configuracionSucursal.upsert({
      where: { sucursalId_clave: { sucursalId, clave } },
      update: { valor },
      create: { sucursalId, clave, valor },
    });
  }
}

async function asegurarEstacion(
  prisma: PrismaService,
  sucursalId: number,
  codigo: string,
  nombre: string,
  color: string,
  orden: number,
) {
  return prisma.estacionPreparacion.upsert({
    where: { sucursalId_codigo: { sucursalId, codigo } },
    update: { nombre, color, orden, estado: true },
    create: { sucursalId, codigo, nombre, color, orden, estado: true },
  });
}

async function asegurarZona(
  prisma: PrismaService,
  sucursalId: number,
  nombre: string,
) {
  const actual = await prisma.zona.findFirst({ where: { sucursalId, nombre } });
  if (actual) return actual;
  return prisma.zona.create({ data: { sucursalId, nombre } });
}

async function asegurarMesa(
  prisma: PrismaService,
  zonaId: number,
  numero: string,
) {
  const actual = await prisma.mesa.findFirst({ where: { zonaId, numero } });
  if (actual) return actual;
  return prisma.mesa.create({ data: { zonaId, numero, capacidad: 4 } });
}

async function asegurarCategoria(
  prisma: PrismaService,
  sucursalId: number,
  nombre: string,
) {
  const actual = await prisma.categoria.findFirst({
    where: { sucursalId, nombre },
  });
  if (actual) return actual;
  return prisma.categoria.create({ data: { sucursalId, nombre } });
}

async function asegurarProducto(
  prisma: PrismaService,
  data: {
    categoriaId: number;
    estacionId: number;
    nombre: string;
    precio: number;
    favorito: boolean;
    stock?: number;
  },
) {
  const actual = await prisma.producto.findFirst({
    where: { categoriaId: data.categoriaId, nombre: data.nombre },
  });
  const inventario =
    data.stock === undefined
      ? {
          estrategiaInventario: EstrategiaInventario.NO_CONTROLAR,
          unidadInventario: UnidadInventario.UNIDAD,
          stock: new Prisma.Decimal(0),
        }
      : {
          estrategiaInventario: EstrategiaInventario.STOCK_DIRECTO,
          unidadInventario: UnidadInventario.UNIDAD,
          stock: new Prisma.Decimal(data.stock),
        };
  const comun = {
    estacionId: data.estacionId,
    precio: new Prisma.Decimal(data.precio),
    favorito: data.favorito,
    disponible: true,
    estado: true,
    ...inventario,
  };
  if (actual)
    return prisma.producto.update({ where: { id: actual.id }, data: comun });
  return prisma.producto.create({
    data: { categoriaId: data.categoriaId, nombre: data.nombre, ...comun },
  });
}

async function asegurarUsuario(
  prisma: PrismaService,
  data: {
    email: string;
    nombres: string;
    apellidos: string;
    password: string;
    rolId: number;
    restauranteId: number;
    sucursalId: number | null;
  },
) {
  return prisma.usuario.upsert({
    where: { email: data.email },
    update: { ...data, activo: true },
    create: { ...data, activo: true },
  });
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

main().catch((error) => {
  console.error('Error ejecutando seed de certificación multiempresa:', error);
  process.exit(1);
});
