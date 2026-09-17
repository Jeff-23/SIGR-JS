import 'dotenv/config';
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const limits = { thumb: num('--thumb-kb', 180) * 1024, medium: num('--medium-kb', 650) * 1024, large: num('--large-kb', 1400) * 1024 };
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL es obligatoria.');
const rootCfg = process.env.MEDIA_STORAGE_DIR?.trim();
const root = rootCfg ? (isAbsolute(rootCfg) ? rootCfg : resolve(process.cwd(), rootCfg)) : resolve(process.cwd(), 'storage', 'media');
const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
let failed = false;
try {
  if (!prisma.imagenProducto) throw new Error('Prisma Client no incluye ImagenProducto. Ejecuta: npx prisma generate');
  const images = await prisma.imagenProducto.findMany({ where: { estado: 'ACTIVA' }, select: { productoId: true, restauranteId: true, tokenPublico: true, bytesOriginales: true } });
  const stats = { records: images.length, originalBytes: 0, variants: { thumb: [], medium: [], large: [] }, missing: [], oversized: [] };
  for (const image of images) {
    stats.originalBytes += image.bytesOriginales;
    const dir = resolve(root, `restaurante-${image.restauranteId}`, `producto-${image.productoId}`, image.tokenPublico);
    for (const variant of Object.keys(limits)) {
      const path = resolve(dir, `${variant}.webp`);
      try {
        const info = await stat(path);
        stats.variants[variant].push(info.size);
        if (info.size > limits[variant]) stats.oversized.push({ productoId: image.productoId, variant, bytes: info.size, limit: limits[variant] });
      } catch { stats.missing.push({ productoId: image.productoId, variant }); }
    }
  }
  for (const variant of Object.keys(stats.variants)) stats.variants[variant] = summarize(stats.variants[variant]);
  const generatedBytes = Object.values(stats.variants).reduce((sum, v) => sum + v.total, 0);
  const result = { storage: root, ...stats, generatedBytes, compressionRatio: stats.originalBytes ? Math.round((generatedBytes / stats.originalBytes) * 10000) / 100 : 0, limitsBytes: limits };
  console.log(JSON.stringify(result, null, 2));
  if (stats.missing.length || stats.oversized.length) { failed = true; console.error('Certificación de media rechazada: faltan variantes o se superan umbrales.'); }
} finally {
  await prisma.$disconnect(); await pool.end();
}
if (failed) process.exitCode = 1;
function num(name, fallback) { const n = Number(args.get(name) ?? fallback); if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} inválido`); return n; }
function summarize(values) { const sorted = [...values].sort((a,b)=>a-b); const pick=(p)=>sorted.length ? sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*p)-1)] : 0; return { count: sorted.length, total: sorted.reduce((a,b)=>a+b,0), avg: sorted.length ? Math.round(sorted.reduce((a,b)=>a+b,0)/sorted.length) : 0, p50: pick(.5), p95: pick(.95), max: sorted.at(-1) ?? 0 }; }
