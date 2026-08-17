import { SetMetadata } from '@nestjs/common';

export const CAPACIDADES_KEY = 'capacidades';

export const Capacidades = (
  ...capacidades: string[]
) =>
  SetMetadata(
    CAPACIDADES_KEY,
    capacidades,
  );