import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  CAPACIDADES_KEY,
} from './capacidades.decorator';

import {
  UsuarioAutenticado,
} from './types/usuario-autenticado.type';

@Injectable()
export class CapabilitiesGuard
  implements CanActivate
{
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const capacidadesRequeridas =
      this.reflector.getAllAndOverride<string[]>(
        CAPACIDADES_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (
      !capacidadesRequeridas ||
      capacidadesRequeridas.length === 0
    ) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{
        user: UsuarioAutenticado;
      }>();

    const usuario = request.user;

    if (!usuario) {
      throw new ForbiddenException(
        'La funcionalidad no está disponible',
      );
    }

    // SUPERADMIN global de SIGR.
    if (
      usuario.rol === 'SUPERADMIN' &&
      usuario.restauranteId === null
    ) {
      return true;
    }

    const tieneCapacidades =
      capacidadesRequeridas.every(
        (capacidad) =>
          usuario.capacidades.includes(
            capacidad,
          ),
      );

    if (!tieneCapacidades) {
      throw new ForbiddenException(
        'Esta funcionalidad no está incluida en el plan del restaurante',
      );
    }

    return true;
  }
}