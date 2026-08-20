import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestConCorrelacion } from './correlacion.middleware';

type CuerpoHttp = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};

@Catch()
export class ExcepcionesFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExcepcionesFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestConCorrelacion>();
    const response = http.getResponse<Response>();
    const estado =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const detalle = this.extraerDetalle(exception, estado);

    if (estado >= 500) {
      const traza = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        JSON.stringify({
          evento: 'error_http',
          estado,
          metodo: request.method,
          ruta: request.originalUrl,
          correlacionId: request.correlacionId,
        }),
        traza,
      );
    }

    response.status(estado).json({
      statusCode: estado,
      ...detalle,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      requestId: request.correlacionId,
    });
  }

  private extraerDetalle(exception: unknown, estado: number): CuerpoHttp {
    if (!(exception instanceof HttpException)) {
      return {
        message: 'Error interno del servidor',
        error: 'Internal Server Error',
      };
    }
    const cuerpo = exception.getResponse();
    if (typeof cuerpo === 'string') {
      return { message: cuerpo, error: exception.name };
    }
    const detalle = cuerpo as CuerpoHttp;
    return {
      message: detalle.message ?? exception.message,
      error: detalle.error ?? HttpStatus[estado],
    };
  }
}
