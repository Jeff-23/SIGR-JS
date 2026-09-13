import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { MatiasFiscalAdapter } from './proveedores/matias/matias-fiscal.adapter';
import { ProveedorFiscalBootstrap } from './proveedores/proveedor-fiscal.bootstrap';
import { ProveedorFiscalRegistry } from './proveedores/proveedor-fiscal.registry';

@Module({
  imports: [PrismaModule],
  controllers: [FiscalController],
  providers: [
    FiscalService,
    ProveedorFiscalRegistry,
    MatiasFiscalAdapter,
    ProveedorFiscalBootstrap,
  ],
  exports: [FiscalService, ProveedorFiscalRegistry],
})
export class FiscalModule {}
