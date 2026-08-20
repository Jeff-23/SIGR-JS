import { SetMetadata } from '@nestjs/common';

export const AUDITORIA_DETALLADA_KEY = 'auditoriaDetallada';

export const AuditoriaDetallada = () =>
  SetMetadata(AUDITORIA_DETALLADA_KEY, true);
