import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ContextoAuditoria } from './auditoria-contexto';
import { ListarAuditoriaDto } from './dto/listar-auditoria.dto';
import { respuestaPaginada } from '../../plataforma/paginacion';

type ClienteAuditoria = Prisma.TransactionClient | PrismaService;

type RegistrarEvento = {
  accion: string;
  recurso: string;
  recursoId?: string | number;
  restauranteId?: number | null;
  sucursalId?: number | null;
  antes?: unknown;
  despues?: unknown;
};

const CLAVES_SENSIBLES =
  /(password|contrasena|contraseña|token|jwt|secret|secreto|authorization|idempotencia)/i;

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  registrar(
    cliente: ClienteAuditoria,
    evento: RegistrarEvento,
    contexto: ContextoAuditoria,
  ) {
    const usuario = contexto.usuario;
    return cliente.eventoAuditoria.create({
      data: {
        accion: evento.accion,
        recurso: evento.recurso,
        recursoId:
          evento.recursoId === undefined ? null : String(evento.recursoId),
        actorId: usuario.id,
        actorEmail: usuario.email,
        restauranteId: evento.restauranteId ?? usuario.restauranteId,
        sucursalId: evento.sucursalId ?? usuario.sucursalId,
        valoresAntes: this.sanitizar(evento.antes),
        valoresDespues: this.sanitizar(evento.despues),
        ip: contexto.ip?.slice(0, 64),
        agenteUsuario: contexto.agenteUsuario?.slice(0, 300),
        correlacionId: contexto.correlacionId.slice(0, 100),
      },
    });
  }

  registrarFueraDeTransaccion(
    evento: RegistrarEvento,
    contexto: ContextoAuditoria,
  ) {
    return this.registrar(this.prisma, evento, contexto);
  }

  async listar(filtros: ListarAuditoriaDto, usuario: UsuarioAutenticado) {
    const global =
      usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
    if (!global && usuario.restauranteId === null) {
      throw new ForbiddenException(
        'La consulta requiere un contexto de restaurante',
      );
    }

    const where: Prisma.EventoAuditoriaWhereInput = {
      ...(global ? {} : { restauranteId: usuario.restauranteId }),
      ...(usuario.sucursalId !== null
        ? { sucursalId: usuario.sucursalId }
        : filtros.sucursalId
          ? { sucursalId: filtros.sucursalId }
          : {}),
      ...(filtros.accion ? { accion: filtros.accion } : {}),
      ...(filtros.recurso ? { recurso: filtros.recurso } : {}),
      ...(filtros.actorId ? { actorId: filtros.actorId } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            creadoEn: {
              ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
              ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
            },
          }
        : {}),
    };

    const skip = (filtros.pagina - 1) * filtros.limite;
    const [datos, total] = await Promise.all([
      this.prisma.eventoAuditoria.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip,
        take: filtros.limite,
      }),
      this.prisma.eventoAuditoria.count({ where }),
    ]);

    return respuestaPaginada(
      datos.map((evento) => ({ ...evento, id: evento.id.toString() })),
      total,
      filtros.pagina,
      filtros.limite,
    );
  }

  private sanitizar(valor: unknown): Prisma.InputJsonValue | undefined {
    if (valor === undefined) return undefined;
    return this.sanitizarValor(valor) as Prisma.InputJsonValue;
  }

  private sanitizarValor(valor: unknown): unknown {
    if (Array.isArray(valor))
      return valor.map((item) => this.sanitizarValor(item));
    if (valor && typeof valor === 'object') {
      if (valor instanceof Date) return valor.toISOString();
      const serializable = valor as { toJSON?: () => unknown };
      if (typeof serializable.toJSON === 'function') {
        return this.sanitizarValor(serializable.toJSON());
      }
      return Object.fromEntries(
        Object.entries(valor)
          .filter(([, contenido]) => contenido !== undefined)
          .map(([clave, contenido]) => [
            clave,
            CLAVES_SENSIBLES.test(clave)
              ? '[REDACTADO]'
              : this.sanitizarValor(contenido),
          ]),
      );
    }
    if (typeof valor === 'bigint') return valor.toString();
    return valor;
  }
}
