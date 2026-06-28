import { SetMetadata } from '@nestjs/common';

// Usaremos los IDs de los roles. Ejemplo: 1 = Admin, 2 = Cajero, 3 = Mesero
export const Roles = (...roles: number[]) => SetMetadata('roles', roles);