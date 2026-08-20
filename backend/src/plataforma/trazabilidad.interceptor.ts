import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from 'express';
import { MetricasService } from './metricas.service';
import { RequestConCorrelacion } from './correlacion.middleware';

@Injectable()
export class TrazabilidadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TrazabilidadInterceptor.name);

  constructor(private readonly metricas: MetricasService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestConCorrelacion>();
    const inicio = Date.now();
    return next.handle().pipe(
      tap({
        next: () =>
          this.registrar(context, request, Date.now() - inicio, 'completada'),
        error: () =>
          this.registrar(context, request, Date.now() - inicio, 'fallida'),
      }),
    );
  }

  private registrar(
    context: ExecutionContext,
    request: RequestConCorrelacion,
    duracionMs: number,
    resultado: 'completada' | 'fallida',
  ) {
    const response = context.switchToHttp().getResponse<Response>();
    this.metricas.registrar(request.method, response.statusCode, duracionMs);
    this.logger.log(
      JSON.stringify({
        evento: 'solicitud_http',
        metodo: request.method,
        ruta: request.originalUrl.split('?')[0],
        duracionMs,
        resultado,
        estado: response.statusCode,
        correlacionId: request.correlacionId,
      }),
    );
  }
}
