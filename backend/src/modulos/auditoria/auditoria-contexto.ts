import { randomUUID } from 'crypto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

export type ContextoAuditoria = {
  usuario: UsuarioAutenticado;
  ip?: string;
  agenteUsuario?: string;
  correlacionId: string;
};

export type RequestAuditable = {
  user: UsuarioAutenticado;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

export function construirContextoAuditoria(
  request: RequestAuditable,
): ContextoAuditoria {
  const encabezadoCorrelacion = request.headers['x-request-id'];
  const agente = request.headers['user-agent'];
  return {
    usuario: request.user,
    ip: request.ip,
    agenteUsuario: Array.isArray(agente) ? agente[0] : agente,
    correlacionId:
      (Array.isArray(encabezadoCorrelacion)
        ? encabezadoCorrelacion[0]
        : encabezadoCorrelacion) ?? randomUUID(),
  };
}
