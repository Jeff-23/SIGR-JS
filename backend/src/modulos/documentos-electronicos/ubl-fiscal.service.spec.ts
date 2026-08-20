import { Prisma } from '@prisma/client';
import { UblFiscalService } from './ubl-fiscal.service';

describe('UblFiscalService', () => {
  it('genera un borrador UBL 2.1 determinista y escapa datos externos', () => {
    const servicio = new UblFiscalService();
    const xml = servicio.generarBorradorFactura({
      numero: 'FV100',
      fecha: new Date('2026-08-20T12:00:00.000Z'),
      proveedor: { nit: '900123456', nombre: 'Restaurante & Bar' },
      adquirente: { documento: '222222222222', nombre: 'Consumidor <final>' },
      subtotal: new Prisma.Decimal('100.00'),
      impuestos: new Prisma.Decimal('8.00'),
      total: new Prisma.Decimal('108.00'),
      detalles: [
        {
          codigo: 1,
          nombre: 'Menú "especial"',
          cantidad: 1,
          precio: new Prisma.Decimal('100.00'),
          subtotal: new Prisma.Decimal('100.00'),
        },
      ],
    });
    expect(xml).toContain('<cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>');
    expect(xml).toContain('<cbc:ID>FV100</cbc:ID>');
    expect(xml).toContain('Restaurante &amp; Bar');
    expect(xml).toContain('Consumidor &lt;final&gt;');
    expect(xml).toContain('Menú &quot;especial&quot;');
    expect(xml).not.toContain('<ext:UBLExtensions>');
  });
});
