import { createHash, timingSafeEqual } from 'node:crypto';

function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonicalizar).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  return `{${Object.keys(objeto)
    .sort()
    .map((clave) => `${JSON.stringify(clave)}:${canonicalizar(objeto[clave])}`)
    .join(',')}}`;
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalizar(payload)).digest('hex');
}

export function hashClaveSync(clave: string): string {
  return createHash('sha256').update(clave, 'utf8').digest('hex');
}

export function secretoCoincide(esperado: string, recibido: string): boolean {
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recibido, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
