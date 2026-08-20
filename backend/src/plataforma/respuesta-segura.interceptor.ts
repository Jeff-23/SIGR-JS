import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

const CAMPOS_INTERNOS = new Set([
  'password',
  'idempotenciaClave',
  'idempotenciaHash',
]);

@Injectable()
export class RespuestaSeguraInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((valor: unknown) => sanitizarSalida(valor)));
  }
}

export function sanitizarSalida(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sanitizarSalida);
  if (!valor || typeof valor !== 'object') return valor;
  if (valor instanceof Date || 'toJSON' in valor) return valor;
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .filter(([clave]) => !CAMPOS_INTERNOS.has(clave))
      .map(([clave, contenido]) => [clave, sanitizarSalida(contenido)]),
  );
}
