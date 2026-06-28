import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesPermitidos = this.reflector.get<number[]>('roles', context.getHandler());
    
    // Si la ruta no tiene la etiqueta @Roles(), dejamos pasar a cualquiera que esté autenticado
    if (!rolesPermitidos) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const usuario = request.user; // Esto lo inyecta automáticamente tu JwtAuthGuard

    // Verificamos si el rol del usuario está dentro de la lista de roles permitidos
    const tienePermiso = rolesPermitidos.includes(usuario.rolId);

    if (!tienePermiso) {
      throw new ForbiddenException('No tienes los permisos necesarios para realizar esta acción');
    }

    return true;
  }
}