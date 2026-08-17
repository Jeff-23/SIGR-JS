import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CapabilitiesGuard } from './capabilities.guard';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '12h',
      },
    }),
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    PermissionsGuard,
    CapabilitiesGuard,
  ],

  exports: [
    RolesGuard,
    PermissionsGuard,
    CapabilitiesGuard,
  ],
})
export class AuthModule {}
