import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RequestConCorrelacion } from './correlacion.middleware';

@Injectable()
export class TrazabilidadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TrazabilidadInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestConCorrelacion>();
    const inicio = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.registrar(request, Date.now() - inicio, 'completada'),
        error: () => this.registrar(request, Date.now() - inicio, 'fallida'),
      }),
    );
  }

  private registrar(
    request: RequestConCorrelacion,
    duracionMs: number,
    resultado: 'completada' | 'fallida',
  ) {
    this.logger.log(
      JSON.stringify({
        evento: 'solicitud_http',
        metodo: request.method,
        ruta: request.originalUrl.split('?')[0],
        duracionMs,
        resultado,
        correlacionId: request.correlacionId,
      }),
    );
  }
}
