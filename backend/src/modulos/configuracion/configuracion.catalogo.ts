import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type DefinicionConfiguracion = {
  valorPredeterminado: string | number;
  validar: (valor: unknown) => boolean;
};

export const CATALOGO_CONFIGURACION = {
  MONEDA: {
    valorPredeterminado: 'COP',
    validar: (valor) => typeof valor === 'string' && /^[A-Z]{3}$/.test(valor),
  },
  ZONA_HORARIA: {
    valorPredeterminado: 'America/Bogota',
    validar: (valor) => {
      if (typeof valor !== 'string' || valor.length > 80) return false;
      try {
        Intl.DateTimeFormat('es', { timeZone: valor });
        return true;
      } catch {
        return false;
      }
    },
  },
  PORCENTAJE_IMPUESTO: {
    valorPredeterminado: 0,
    validar: (valor) =>
      typeof valor === 'number' &&
      Number.isFinite(valor) &&
      valor >= 0 &&
      valor <= 100,
  },
  PREFIJO_PEDIDO: {
    valorPredeterminado: 'PED',
    validar: validarPrefijo,
  },
  PREFIJO_VENTA: {
    valorPredeterminado: 'VEN',
    validar: validarPrefijo,
  },
  PREFIJO_FACTURA: {
    valorPredeterminado: 'FAC',
    validar: validarPrefijo,
  },
} satisfies Record<string, DefinicionConfiguracion>;

export type ClaveConfiguracion = keyof typeof CATALOGO_CONFIGURACION;

function validarPrefijo(valor: unknown): boolean {
  return typeof valor === 'string' && /^[A-Z0-9_-]{1,20}$/.test(valor);
}

export function validarConfiguracion(
  claveRecibida: string,
  valor: unknown,
): { clave: ClaveConfiguracion; valor: Prisma.InputJsonValue } {
  const clave = claveRecibida.toUpperCase() as ClaveConfiguracion;
  const definicion = CATALOGO_CONFIGURACION[clave];

  if (!definicion) {
    throw new BadRequestException(
      `La clave de configuración ${claveRecibida} no está soportada`,
    );
  }

  if (!definicion.validar(valor)) {
    throw new BadRequestException(
      `El valor no es válido para la configuración ${clave}`,
    );
  }

  return { clave, valor: valor as Prisma.InputJsonValue };
}
