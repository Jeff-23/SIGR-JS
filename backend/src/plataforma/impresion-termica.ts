import { PrismaService } from '../prisma/prisma.service';

export type AnchoPapelTermico = 58 | 80;

export async function configuracionImpresionTermica(
  prisma: PrismaService,
  restauranteId: number,
  sucursalId: number,
) {
  const [
    anchoSucursal,
    anchoRestaurante,
    monedaSucursal,
    monedaRestaurante,
    zonaSucursal,
    zonaRestaurante,
  ] = await Promise.all([
    prisma.configuracionSucursal.findUnique({
      where: { sucursalId_clave: { sucursalId, clave: 'ANCHO_PAPEL' } },
    }),
    prisma.configuracionRestaurante.findUnique({
      where: { restauranteId_clave: { restauranteId, clave: 'ANCHO_PAPEL' } },
    }),
    prisma.configuracionSucursal.findUnique({
      where: { sucursalId_clave: { sucursalId, clave: 'MONEDA' } },
    }),
    prisma.configuracionRestaurante.findUnique({
      where: { restauranteId_clave: { restauranteId, clave: 'MONEDA' } },
    }),
    prisma.configuracionSucursal.findUnique({
      where: { sucursalId_clave: { sucursalId, clave: 'ZONA_HORARIA' } },
    }),
    prisma.configuracionRestaurante.findUnique({
      where: { restauranteId_clave: { restauranteId, clave: 'ZONA_HORARIA' } },
    }),
  ]);

  const valorAncho = anchoSucursal?.valor ?? anchoRestaurante?.valor ?? 80;
  const ancho: AnchoPapelTermico = Number(valorAncho) === 58 ? 58 : 80;
  const valorMoneda =
    monedaSucursal?.valor ?? monedaRestaurante?.valor ?? 'COP';
  const moneda = typeof valorMoneda === 'string' ? valorMoneda : 'COP';
  const valorZona =
    zonaSucursal?.valor ?? zonaRestaurante?.valor ?? 'America/Bogota';
  const zonaHoraria =
    typeof valorZona === 'string' ? valorZona : 'America/Bogota';
  return { ancho, moneda, zonaHoraria };
}

export function escaparHtml(valor: string | number | null | undefined) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fechaLocalTermica(fecha: Date, zonaHoraria: string) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: zonaHoraria,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(fecha);
}

export function dineroTermico(
  valor: { toNumber?: () => number } | number | string,
  moneda = 'COP',
) {
  const numero =
    typeof valor === 'object' &&
    valor !== null &&
    'toNumber' in valor &&
    typeof valor.toNumber === 'function'
      ? valor.toNumber()
      : Number(valor);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numero) ? numero : 0);
}

export function documentoTermicoHtml({
  titulo,
  ancho,
  cuerpo,
}: {
  titulo: string;
  ancho: AnchoPapelTermico;
  cuerpo: string;
}) {
  const esc = escaparHtml;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><style>
@page{size:${ancho}mm auto;margin:2mm}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000}body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;width:${ancho - 4}mm;max-width:${ancho - 4}mm;margin:0 auto;font-size:${ancho === 58 ? '10px' : '11px'};line-height:1.25}.center{text-align:center}.right{text-align:right}.strong{font-weight:800}.title{font-size:1.35em;font-weight:900;margin:0 0 2mm}.muted{font-size:.9em}.sep{border:0;border-top:1px dashed #000;margin:2mm 0}.row{display:flex;justify-content:space-between;gap:2mm}.row>span:first-child{min-width:0}.line{margin:1.5mm 0}.note{font-weight:800;margin-left:3mm}.mods{margin-left:3mm}.total{font-size:1.15em;font-weight:900}.badge{display:inline-block;border:1px solid #000;padding:.5mm 1mm;font-weight:900}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:.6mm 0}td:last-child{text-align:right;white-space:nowrap}@media print{body{width:${ancho - 4}mm;max-width:${ancho - 4}mm}}
</style></head><body>${cuerpo}</body></html>`;
}
