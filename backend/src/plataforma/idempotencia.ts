import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

export function normalizarClaveIdempotencia(valor: string | undefined) {
  const clave = valor?.trim();
  if (!clave || !/^[a-zA-Z0-9._:-]{8,100}$/.test(clave)) {
    throw new BadRequestException(
      'Idempotency-Key es obligatorio y debe tener entre 8 y 100 caracteres válidos',
    );
  }
  return clave;
}

export function hashSolicitud(valor: unknown) {
  return createHash('sha256').update(serializarCanonico(valor)).digest('hex');
}

export function validarReplayIdempotente(
  hashGuardado: string | null,
  hashRecibido: string,
) {
  if (!hashGuardado || hashGuardado !== hashRecibido) {
    throw new ConflictException(
      'Idempotency-Key ya fue utilizada con una solicitud diferente',
    );
  }
}

function serializarCanonico(valor: unknown): string {
  if (Array.isArray(valor)) {
    return `[${valor.map(serializarCanonico).join(',')}]`;
  }
  if (valor && typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, contenido]) => contenido !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entradas
      .map(
        ([clave, contenido]) =>
          `${JSON.stringify(clave)}:${serializarCanonico(contenido)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(valor);
}
