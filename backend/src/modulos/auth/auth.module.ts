import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CapabilitiesGuard } from './capabilities.guard';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { obtenerEntorno } from '../../config/entorno';

const entorno = obtenerEntorno();

@Module({
  imports: [
    JwtModule.register({
      secret: entorno.jwtSecret,
      signOptions: {
        expiresIn: entorno.jwtExpiraEn,
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    PermissionsGuard,
    CapabilitiesGuard,
  ],

  exports: [RolesGuard, PermissionsGuard, CapabilitiesGuard],
})
export class AuthModule {}
