import { Injectable } from '@nestjs/common';
import { ProveedorFiscalAdapter } from './proveedor-fiscal.types';

@Injectable()
export class ProveedorFiscalRegistry {
  private readonly adaptadores = new Map<string, ProveedorFiscalAdapter>();

  registrar(adaptador: ProveedorFiscalAdapter) {
    const codigo = this.normalizar(adaptador.codigo);
    if (!codigo) throw new Error('El adaptador fiscal requiere un código');
    if (this.adaptadores.has(codigo)) {
      throw new Error(`El adaptador fiscal ${codigo} ya está registrado`);
    }
    this.adaptadores.set(codigo, adaptador);
  }

  obtener(codigo: string | null | undefined) {
    if (!codigo) return null;
    return this.adaptadores.get(this.normalizar(codigo)) ?? null;
  }

  codigos() {
    return [...this.adaptadores.keys()].sort();
  }

  private normalizar(codigo: string) {
    return codigo.trim().toUpperCase();
  }
}
