import { ProveedorFiscalRegistry } from './proveedor-fiscal.registry';
import { ProveedorFiscalAdapter } from './proveedor-fiscal.types';

describe('ProveedorFiscalRegistry', () => {
  it('registra proveedores sin confundir mayúsculas y minúsculas', () => {
    const registry = new ProveedorFiscalRegistry();
    const adapter = { codigo: 'proveedor-demo' } as ProveedorFiscalAdapter;
    registry.registrar(adapter);
    expect(registry.obtener(' PROVEEDOR-DEMO ')).toBe(adapter);
    expect(registry.codigos()).toEqual(['PROVEEDOR-DEMO']);
  });

  it('falla cerrado ante proveedores desconocidos o duplicados', () => {
    const registry = new ProveedorFiscalRegistry();
    const adapter = { codigo: 'P1' } as ProveedorFiscalAdapter;
    registry.registrar(adapter);
    expect(registry.obtener('P2')).toBeNull();
    expect(() => registry.registrar(adapter)).toThrow('ya está registrado');
  });
});
