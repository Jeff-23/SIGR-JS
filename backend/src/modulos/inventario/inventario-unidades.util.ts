import {
  BadRequestException,
} from '@nestjs/common';
import {
  Prisma,
  UnidadInventario,
} from '@prisma/client';

type FamiliaUnidad =
  | 'MASA'
  | 'VOLUMEN'
  | 'UNIDAD'
  | 'PORCION';

function familia(
  unidad: UnidadInventario,
): FamiliaUnidad {
  switch (unidad) {
    case UnidadInventario.GR:
    case UnidadInventario.KG:
      return 'MASA';

    case UnidadInventario.ML:
    case UnidadInventario.L:
      return 'VOLUMEN';

    case UnidadInventario.UNIDAD:
      return 'UNIDAD';

    case UnidadInventario.PORCION:
      return 'PORCION';
  }
}

export function unidadesCompatibles(
  origen: UnidadInventario,
  destino: UnidadInventario,
) {
  return (
    origen === destino ||
    familia(origen) === familia(destino)
  );
}

export function convertirUnidad(
  cantidadEntrada:
    Prisma.Decimal | number | string,
  origen: UnidadInventario,
  destino: UnidadInventario,
) {
  const cantidad =
    new Prisma.Decimal(
      cantidadEntrada,
    );

  if (cantidad.lte(0)) {
    throw new BadRequestException(
      'La cantidad debe ser mayor que cero',
    );
  }

  if (
    !unidadesCompatibles(
      origen,
      destino,
    )
  ) {
    throw new BadRequestException(
      `No existe conversión válida entre ${origen} y ${destino}`,
    );
  }

  if (origen === destino) {
    return cantidad;
  }

  if (
    origen === UnidadInventario.KG &&
    destino === UnidadInventario.GR
  ) {
    return cantidad.mul(1000);
  }

  if (
    origen === UnidadInventario.GR &&
    destino === UnidadInventario.KG
  ) {
    return cantidad.div(1000);
  }

  if (
    origen === UnidadInventario.L &&
    destino === UnidadInventario.ML
  ) {
    return cantidad.mul(1000);
  }

  if (
    origen === UnidadInventario.ML &&
    destino === UnidadInventario.L
  ) {
    return cantidad.div(1000);
  }

  throw new BadRequestException(
    `No existe conversión válida entre ${origen} y ${destino}`,
  );
}
