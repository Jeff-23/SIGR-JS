import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL es obligatoria.');

const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const entidades = [
  ['Restaurante', prisma.restaurante],
  ['Cliente', prisma.cliente],
  ['Sucursal', prisma.sucursal],
  ['Usuario', prisma.usuario],
  ['Mesa', prisma.mesa],
  ['Categoria', prisma.categoria],
  ['Producto', prisma.producto],
  ['EstacionPreparacion', prisma.estacionPreparacion],
  ['Pedido', prisma.pedido],
  ['Domicilio', prisma.domicilio],
  ['DetallePedido', prisma.detallePedido],
  ['Comanda', prisma.comanda],
  ['DetalleComanda', prisma.detalleComanda],
  ['Venta', prisma.venta],
  ['DetalleVenta', prisma.detalleVenta],
  ['Articulo', prisma.articulo],
  ['MovimientoInventario', prisma.movimientoInventario],
  ['MetodoPago', prisma.metodoPago],
  ['Factura', prisma.factura],
  ['Pago', prisma.pago],
  ['Caja', prisma.caja],
  ['MovimientoCaja', prisma.movimientoCaja],
];

try {
  let total = 0;
  for (const [nombre, modelo] of entidades) {
    const filas = await modelo.findMany({ select: { globalId: true } });
    const ids = filas.map((x) => x.globalId);
    const faltantes = ids.filter((x) => !x).length;
    const duplicados = ids.length - new Set(ids).size;
    if (faltantes || duplicados) {
      throw new Error(`${nombre}: faltantes=${faltantes}, duplicados=${duplicados}`);
    }
    total += ids.length;
    console.log(`OK ${nombre}: ${ids.length}`);
  }
  console.log(`IDENTIDAD DISTRIBUIDA OK: ${entidades.length} entidades, ${total} registros verificados.`);
} finally {
  await prisma.$disconnect();
  await pool.end();
}
