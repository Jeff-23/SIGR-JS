import { Injectable, OnModuleInit } from '@nestjs/common';
import { MatiasFiscalAdapter } from './matias/matias-fiscal.adapter';
import { ProveedorFiscalRegistry } from './proveedor-fiscal.registry';

@Injectable()
export class ProveedorFiscalBootstrap implements OnModuleInit {
  constructor(
    private readonly registry: ProveedorFiscalRegistry,
    private readonly matias: MatiasFiscalAdapter,
  ) {}

  onModuleInit() {
    this.registry.registrar(this.matias);
  }
}
