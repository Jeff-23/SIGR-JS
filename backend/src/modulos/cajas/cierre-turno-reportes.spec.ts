import {
  CierreTurnoSnapshot,
  generarPdfCierreFinal,
  generarPdfSimple,
  generarXlsx,
} from './cierre-turno-reportes';

const snapshot: CierreTurnoSnapshot = {
  version: 2,
  restaurante: {
    nombre: 'York Castellana',
    razonSocial: 'ALEJA FOOD S.A.S',
    nit: '901754572',
    dv: '5',
    direccion: 'CR 66 31A 129 P1 LC 1',
    municipio: 'Cartagena',
    departamento: 'Bolívar',
    telefono: '3005256644',
    correo: 'atapiav@york.com',
  },
  caja: {
    id: 10,
    nombre: 'Caja turno am',
    sucursalId: 840,
    sucursal: 'Castellana',
    fechaApertura: '2026-09-24T13:00:00.000Z',
    generadoEn: '2026-09-24T18:00:00.000Z',
    saldoInicial: 500000,
    cajero: 'Faneth Carmona',
  },
  resumen: {
    operaciones: 2,
    totalVentas: 108000,
    totalPagos: 108000,
    totalDevoluciones: 0,
    totalNetoCobrado: 108000,
    efectivo: 58000,
    otrosPagos: 50000,
    totalIngresos: 10000,
    totalEgresos: 5000,
    efectivoEsperado: 563000,
    subtotalVentas: 100000,
    descuentos: 0,
    impuestos: 0,
    impoconsumo: 8000,
    propinas: 0,
    domicilios: 0,
    primerComprobanteInterno: 'FAC-0001',
    ultimoComprobanteInterno: 'FAC-0002',
  },
  formasPago: [
    {
      metodo: 'Efectivo',
      tipo: 'EFECTIVO',
      bruto: 58000,
      devoluciones: 0,
      neto: 58000,
    },
    {
      metodo: 'Tarjeta',
      tipo: 'TARJETA',
      bruto: 50000,
      devoluciones: 0,
      neto: 50000,
    },
  ],
  grupos: [{ grupo: 'Alimentos', cantidad: 2, base: 100000 }],
  productos: [
    {
      codigo: '01',
      producto: 'Perro Super',
      grupo: 'Alimentos',
      cantidad: 2,
      base: 100000,
    },
  ],
  ventas: [],
};

describe('reportes de cierre de turno', () => {
  it('genera Excel con resumen, formas de pago y consumo de productos', () => {
    const contenido = generarXlsx(snapshot).toString('utf8');

    expect(contenido).toContain('Formas de pago');
    expect(contenido).toContain('Consumo productos');
    expect(contenido).toContain('Impoconsumo');
    expect(contenido).toContain('Perro Super');
    expect(contenido).toContain('Documento interno administrativo');
  });

  it('genera PDF previo marcado como documento interno', () => {
    const contenido = generarPdfSimple(snapshot).toString('utf8');

    expect(contenido.startsWith('%PDF-')).toBe(true);
    expect(contenido).toContain('REPORTE PREVIO DE CIERRE');
    expect(contenido).toContain('Impoconsumo: 8000.00');
    expect(contenido).toContain('no acredita validación DIAN');
  });

  it('genera tirilla final con arqueo y resumen comercial', () => {
    const contenido = generarPdfCierreFinal({
      cajaId: 10,
      cajaNombre: 'Caja turno am',
      sucursal: 'Castellana',
      fechaApertura: new Date('2026-09-24T13:00:00.000Z'),
      fechaCierre: new Date('2026-09-24T18:00:00.000Z'),
      saldoInicial: 500000,
      saldoEsperado: 563000,
      saldoContado: 563000,
      diferencia: 0,
      totalEfectivoSistema: 58000,
      totalOtrosPagos: 50000,
      totalIngresos: 10000,
      totalEgresos: 5000,
      observacionCierre: null,
      cerradoPor: 'Alejandra Tapia',
      snapshot,
    }).toString('utf8');

    expect(contenido).toContain('TIRILLA FINAL DE CIERRE');
    expect(contenido).toContain('Efectivo contado: 563000.00');
    expect(contenido).toContain('Primer comprobante interno: FAC-0001');
    expect(contenido).toContain(
      'No es factura ni documento equivalente electrónico',
    );
  });
});
