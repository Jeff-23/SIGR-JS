import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CuentasPagarController } from './cuentas-pagar.controller';
import { CuentasPagarService } from './cuentas-pagar.service';
@Module({
  imports: [PrismaModule],
  controllers: [CuentasPagarController],
  providers: [CuentasPagarService],
})
export class CuentasPagarModule {}
