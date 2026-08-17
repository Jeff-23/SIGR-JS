import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISOS_KEY } from './permisos.decorator';
import { UsuarioAutenticado } from './types/usuario-autenticado.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const permisosRequeridos =
      this.reflector.getAllAndOverride<string[]>(
        PERMISOS_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (
      !permisosRequeridos ||
      permisosRequeridos.length === 0
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
        'No tienes permisos para realizar esta acción',
      );
    }

    if (
      usuario.rol === 'SUPERADMIN' &&
      usuario.restauranteId === null
    ) {
      return true;
    }

    const tieneTodosLosPermisos =
      permisosRequeridos.every(
        (permiso) =>
          usuario.permisos.includes(permiso),
      );

    if (!tieneTodosLosPermisos) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }

    return true;
  }
}
