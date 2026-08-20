import { BadRequestException } from '@nestjs/common';

const ISO_CON_ZONA = /(Z|[+-]\d{2}:\d{2})$/;

export function fechaOperativa(valor: string, ahora = new Date()) {
  if (!ISO_CON_ZONA.test(valor)) {
    throw new BadRequestException(
      'fechaOperacion debe incluir zona horaria explícita (Z o ±HH:mm)',
    );
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException('La fecha de operación no es válida');
  }
  if (fecha.getTime() > ahora.getTime()) {
    throw new BadRequestException(
      'La fecha de operación no puede estar en el futuro',
    );
  }
  return fecha;
}
