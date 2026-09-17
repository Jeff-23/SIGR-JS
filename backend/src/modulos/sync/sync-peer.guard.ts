import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { hashClaveSync, secretoCoincide } from './sync.crypto';

export type SyncRequest = Request & {
  syncPeerNodeId?: string;
  syncPeerRestauranteGlobalId?: string | null;
  syncPeerSucursalGlobalId?: string | null;
};

@Injectable()
export class SyncPeerGuard implements CanActivate {
  private readonly entorno = obtenerEntorno();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.entorno.syncHabilitado || this.entorno.syncRol !== 'CLOUD') {
      throw new UnauthorizedException('Receptor sync no disponible');
    }
    const req = context.switchToHttp().getRequest<SyncRequest>();
    const nodeId = header(req, 'x-sigr-sync-node');
    const clave = header(req, 'x-sigr-sync-key');
    if (!nodeId || !clave)
      throw new UnauthorizedException('Credenciales sync incompletas');

    const peer = await this.prisma.syncPeer.findUnique({ where: { nodeId } });
    if (!peer?.activo || peer.rol !== 'EDGE') {
      throw new UnauthorizedException('Nodo sync no autorizado');
    }
    if (!secretoCoincide(peer.claveHash, hashClaveSync(clave))) {
      throw new UnauthorizedException('Clave sync invalida');
    }
    req.syncPeerNodeId = peer.nodeId;
    req.syncPeerRestauranteGlobalId = peer.restauranteGlobalId;
    req.syncPeerSucursalGlobalId = peer.sucursalGlobalId;
    void this.prisma.syncPeer
      .update({ where: { id: peer.id }, data: { ultimoAccesoEn: new Date() } })
      .catch(() => undefined);
    return true;
  }
}

function header(req: Request, nombre: string): string | undefined {
  const valor = req.headers[nombre];
  return Array.isArray(valor) ? valor[0] : valor;
}
