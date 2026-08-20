import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from './roles.decorator';
import { UsuarioAutenticado } from './types/usuario-autenticado.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesPermitidos = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rolesPermitidos || rolesPermitidos.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user: UsuarioAutenticado }>();

    const usuario = request.user;

    if (!usuario) {
      throw new ForbiddenException(
        'No tienes los permisos necesarios para realizar esta acción',
      );
    }

    // El SUPERADMIN global de SIGR puede acceder
    // a las rutas protegidas por roles durante
    // la transición hacia permisos granulares.
    //
    // restauranteId === null evita que un rol de
    // restaurante llamado SUPERADMIN obtenga este bypass.
    if (usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null) {
      return true;
    }

    if (!rolesPermitidos.includes(usuario.rol)) {
      throw new ForbiddenException(
        'No tienes los permisos necesarios para realizar esta acción',
      );
    }

    return true;
  }
}
