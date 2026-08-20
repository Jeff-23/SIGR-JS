import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  construirContextoAuditoria,
  RequestAuditable,
} from './auditoria-contexto';
import { AUDITORIA_DETALLADA_KEY } from './auditoria-detallada.decorator';
import { resolverRecursoAuditoria } from './auditoria-recursos';
import { AuditoriaService } from './auditoria.service';

type RequestHttpAuditable = RequestAuditable & {
  method: string;
  originalUrl?: string;
  url: string;
  body?: unknown;
  params?: Record<string, string>;
  user?: UsuarioAutenticado;
};

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaInterceptor.name);
  private readonly metodosMutacion = new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ]);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestHttpAuditable>();
    const detallada = this.reflector.getAllAndOverride<boolean>(
      AUDITORIA_DETALLADA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      detallada ||
      !request.user ||
      !this.metodosMutacion.has(request.method.toUpperCase())
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap((resultado) =>
        from(this.registrar(request, resultado)).pipe(
          mergeMap(() => of(resultado)),
          catchError((error: unknown) => {
            this.logger.error(
              `No fue posible registrar auditoría transversal: ${
                error instanceof Error
                  ? error.message
                  : typeof error === 'string'
                    ? error
                    : 'error no serializable'
              }`,
            );
            return of(resultado);
          }),
        ),
      ),
    );
  }

  private registrar(request: RequestHttpAuditable, resultado: unknown) {
    const ruta = request.originalUrl ?? request.url;
    const recurso = resolverRecursoAuditoria(ruta);
    const recursoId = this.extraerId(request.params, resultado);
    return this.auditoria.registrarFueraDeTransaccion(
      {
        accion: `${recurso}_${request.method.toUpperCase()}`,
        recurso,
        recursoId,
        antes: null,
        despues: {
          ruta: ruta.split('?')[0],
          solicitud: request.body,
          resultado,
        },
      },
      construirContextoAuditoria(request),
    );
  }

  private extraerId(
    params: Record<string, string> | undefined,
    resultado: unknown,
  ): string | number | undefined {
    if (params?.id) return params.id;
    if (resultado && typeof resultado === 'object' && 'id' in resultado) {
      const id = (resultado as { id?: unknown }).id;
      if (typeof id === 'string' || typeof id === 'number') return id;
    }
    return undefined;
  }
}
