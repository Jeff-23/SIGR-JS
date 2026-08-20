import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function dinero(valor: number | string | Prisma.Decimal, campo: string) {
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(valor);
  } catch {
    throw new BadRequestException(
      `${campo} debe ser un valor monetario válido`,
    );
  }
  if (!decimal.isFinite() || decimal.decimalPlaces() > 2) {
    throw new BadRequestException(`${campo} admite máximo dos decimales`);
  }
  if (decimal.abs().gt('9999999999.99')) {
    throw new BadRequestException(`${campo} excede el máximo permitido`);
  }
  return decimal;
}
