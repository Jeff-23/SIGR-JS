import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { obtenerEntorno } from '../../config/entorno';
import { secretoCoincide } from './sync.crypto';

@Injectable()
export class SyncCertGuard implements CanActivate {
  private readonly entorno = obtenerEntorno();

  canActivate(context: ExecutionContext): boolean {
    if (!this.entorno.syncCertificationEnabled || !this.entorno.syncCertKey) {
      throw new NotFoundException();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const recibido = req.headers['x-sigr-cert-key'];
    const clave = Array.isArray(recibido) ? recibido[0] : recibido;
    if (!clave || !secretoCoincide(this.entorno.syncCertKey, clave)) {
      throw new UnauthorizedException('Clave de certificacion invalida');
    }
    return true;
  }
}
