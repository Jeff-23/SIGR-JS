import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { ProveedorFiscalRegistry } from './proveedores/proveedor-fiscal.registry';

@Module({
  imports: [PrismaModule],
  controllers: [FiscalController],
  providers: [FiscalService, ProveedorFiscalRegistry],
  exports: [FiscalService, ProveedorFiscalRegistry],
})
export class FiscalModule {}
