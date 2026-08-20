import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const ENCABEZADO_CORRELACION = 'x-request-id';

export type RequestConCorrelacion = Request & { correlacionId: string };

@Injectable()
export class CorrelacionMiddleware implements NestMiddleware {
  use(request: RequestConCorrelacion, response: Response, next: NextFunction) {
    const recibido = request.header(ENCABEZADO_CORRELACION)?.trim();
    request.correlacionId = esCorrelacionValida(recibido)
      ? recibido
      : randomUUID();
    request.headers[ENCABEZADO_CORRELACION] = request.correlacionId;
    response.setHeader(ENCABEZADO_CORRELACION, request.correlacionId);
    next();
  }
}

function esCorrelacionValida(valor: string | undefined): valor is string {
  return Boolean(valor && /^[a-zA-Z0-9._:-]{1,100}$/.test(valor));
}
