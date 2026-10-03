export type CierreTurnoSnapshot = {
  version: 1 | 2;
  restaurante?: {
    nombre: string;
    razonSocial: string | null;
    nit: string;
    dv: string | null;
    direccion: string | null;
    municipio: string | null;
    departamento: string | null;
    telefono: string | null;
    correo: string | null;
  };
  caja: {
    id: number;
    nombre: string;
    sucursalId: number;
    sucursal: string;
    fechaApertura: string;
    generadoEn: string;
    saldoInicial?: number;
    cajero?: string;
  };
  resumen: {
    operaciones: number;
    totalVentas: number;
    totalPagos: number;
    totalDevoluciones: number;
    totalNetoCobrado: number;
    efectivo: number;
    otrosPagos: number;
    totalIngresos?: number;
    totalEgresos?: number;
    efectivoEsperado?: number;
    subtotalVentas?: number;
    descuentos?: number;
    impuestos?: number;
    impoconsumo?: number;
    propinas?: number;
    domicilios?: number;
    primerComprobanteInterno?: string | null;
    ultimoComprobanteInterno?: string | null;
  };
  formasPago?: Array<{
    metodo: string;
    tipo: string;
    bruto: number;
    devoluciones: number;
    neto: number;
  }>;
  grupos?: Array<{
    grupo: string;
    cantidad: number;
    base: number;
  }>;
  productos?: Array<{
    codigo: string | null;
    producto: string;
    grupo: string;
    cantidad: number;
    base: number;
  }>;
  ventas: Array<{
    ventaId: number;
    fechaOperacion: string;
    estado: string;
    origen: string;
    total: number;
    subtotal: number;
    descuentos: number;
    impuestos: number;
    impoconsumo: number;
    propina: number;
    domicilio: number;
    pedidoId: number | null;
    mesa: string | null;
    cliente: string | null;
    identificacionCliente: string | null;
    facturaInterna: string | null;
    estadoFactura: string | null;
    documentoElectronicoEstado: string | null;
    documentoElectronicoNumero: string | null;
    fiscalizada: boolean;
    detalles: Array<{
      codigo?: string | null;
      producto: string;
      grupo?: string;
      cantidad: number;
      precioUnitario: number;
      subtotal: number;
    }>;
    pagos: Array<{
      metodo: string;
      tipo: string;
      monto: number;
      devoluciones: number;
      neto: number;
      referencia: string | null;
    }>;
  }>;
};

function xml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; content: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.content.length, 18);
    local.writeUInt32LE(file.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.content.length, 20);
    central.writeUInt32LE(file.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + file.content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function worksheet(rows: string[][]) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          let n = columnIndex + 1;
          let letters = '';
          while (n > 0) {
            const rem = (n - 1) % 26;
            letters = String.fromCharCode(65 + rem) + letters;
            n = Math.floor((n - 1) / 26);
          }
          return `<c r="${letters}${rowIndex + 1}" t="inlineStr"><is><t>${xml(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function generarXlsx(snapshot: CierreTurnoSnapshot) {
  const headers = [
    'Venta',
    'Fecha',
    'Estado venta',
    'Origen',
    'Pedido',
    'Mesa',
    'Cliente',
    'Identificación',
    'Factura interna',
    'Estado factura',
    'Estado electrónico',
    'Número electrónico',
    'Fiscalizada',
    'Producto',
    'Cantidad',
    'Precio unitario',
    'Subtotal línea',
    'Subtotal venta',
    'Descuentos',
    'Impuestos',
    'Impoconsumo',
    'Propina',
    'Domicilio',
    'Total venta',
    'Método pago',
    'Tipo pago',
    'Pago bruto',
    'Devoluciones',
    'Pago neto',
    'Referencia',
  ];

  const operationRows: string[][] = [headers];
  for (const venta of snapshot.ventas) {
    const detalles = venta.detalles.length
      ? venta.detalles
      : [{ producto: '', cantidad: 0, precioUnitario: 0, subtotal: 0 }];
    const pagos = venta.pagos.length
      ? venta.pagos
      : [
          {
            metodo: '',
            tipo: '',
            monto: 0,
            devoluciones: 0,
            neto: 0,
            referencia: null,
          },
        ];
    const count = Math.max(detalles.length, pagos.length);
    for (let i = 0; i < count; i += 1) {
      const detalle = detalles[i] ?? {
        producto: '',
        cantidad: 0,
        precioUnitario: 0,
        subtotal: 0,
      };
      const pago = pagos[i] ?? {
        metodo: '',
        tipo: '',
        monto: 0,
        devoluciones: 0,
        neto: 0,
        referencia: null,
      };
      operationRows.push([
        String(venta.ventaId),
        venta.fechaOperacion,
        venta.estado,
        venta.origen,
        venta.pedidoId === null ? '' : String(venta.pedidoId),
        venta.mesa ?? '',
        venta.cliente ?? '',
        venta.identificacionCliente ?? '',
        venta.facturaInterna ?? '',
        venta.estadoFactura ?? '',
        venta.documentoElectronicoEstado ?? '',
        venta.documentoElectronicoNumero ?? '',
        venta.fiscalizada ? 'SÍ' : 'NO',
        detalle.producto,
        String(detalle.cantidad),
        money(detalle.precioUnitario).toFixed(2),
        money(detalle.subtotal).toFixed(2),
        money(venta.subtotal).toFixed(2),
        money(venta.descuentos).toFixed(2),
        money(venta.impuestos).toFixed(2),
        money(venta.impoconsumo).toFixed(2),
        money(venta.propina).toFixed(2),
        money(venta.domicilio).toFixed(2),
        money(venta.total).toFixed(2),
        pago.metodo,
        pago.tipo,
        money(pago.monto).toFixed(2),
        money(pago.devoluciones).toFixed(2),
        money(pago.neto).toFixed(2),
        pago.referencia ?? '',
      ]);
    }
  }

  const r = snapshot.restaurante;
  const summaryRows = [
    ['Campo', 'Valor'],
    ['Documento', 'Reporte administrativo interno de cierre'],
    ['Restaurante', r?.nombre ?? ''],
    ['Razón social', r?.razonSocial ?? ''],
    ['NIT', r ? `${r.nit}${r.dv ? `-${r.dv}` : ''}` : ''],
    ['Dirección', r?.direccion ?? ''],
    [
      'Municipio / departamento',
      [r?.municipio, r?.departamento].filter(Boolean).join(' / '),
    ],
    ['Teléfono', r?.telefono ?? ''],
    ['Correo', r?.correo ?? ''],
    ['Sucursal', snapshot.caja.sucursal],
    ['Caja / turno', snapshot.caja.nombre],
    ['Cajero', snapshot.caja.cajero ?? ''],
    ['Apertura', snapshot.caja.fechaApertura],
    ['Generado', snapshot.caja.generadoEn],
    ['Base inicial', money(snapshot.caja.saldoInicial ?? 0).toFixed(2)],
    [
      'Primer comprobante interno',
      snapshot.resumen.primerComprobanteInterno ?? '',
    ],
    [
      'Último comprobante interno',
      snapshot.resumen.ultimoComprobanteInterno ?? '',
    ],
    ['Operaciones', String(snapshot.resumen.operaciones)],
    [
      'Subtotal / base ventas',
      money(snapshot.resumen.subtotalVentas ?? 0).toFixed(2),
    ],
    ['Descuentos', money(snapshot.resumen.descuentos ?? 0).toFixed(2)],
    [
      'IVA / otros impuestos',
      money(snapshot.resumen.impuestos ?? 0).toFixed(2),
    ],
    ['Impoconsumo', money(snapshot.resumen.impoconsumo ?? 0).toFixed(2)],
    ['Propinas', money(snapshot.resumen.propinas ?? 0).toFixed(2)],
    ['Domicilios', money(snapshot.resumen.domicilios ?? 0).toFixed(2)],
    ['Total ventas', money(snapshot.resumen.totalVentas).toFixed(2)],
    ['Pagos brutos', money(snapshot.resumen.totalPagos).toFixed(2)],
    ['Devoluciones', money(snapshot.resumen.totalDevoluciones).toFixed(2)],
    ['Cobrado neto', money(snapshot.resumen.totalNetoCobrado).toFixed(2)],
    ['Efectivo neto', money(snapshot.resumen.efectivo).toFixed(2)],
    ['Otros medios netos', money(snapshot.resumen.otrosPagos).toFixed(2)],
    [
      'Ingresos manuales',
      money(snapshot.resumen.totalIngresos ?? 0).toFixed(2),
    ],
    ['Egresos manuales', money(snapshot.resumen.totalEgresos ?? 0).toFixed(2)],
    [
      'Efectivo esperado',
      money(snapshot.resumen.efectivoEsperado ?? 0).toFixed(2),
    ],
    ['', ''],
    [
      'Nota',
      'Documento interno administrativo. No acredita validación ni aceptación DIAN.',
    ],
  ];

  const paymentRows: string[][] = [
    ['Método', 'Tipo', 'Pago bruto', 'Devoluciones', 'Neto'],
    ...(snapshot.formasPago ?? []).map((item) => [
      item.metodo,
      item.tipo,
      money(item.bruto).toFixed(2),
      money(item.devoluciones).toFixed(2),
      money(item.neto).toFixed(2),
    ]),
  ];

  const productRows: string[][] = [
    ['Código', 'Producto', 'Grupo / categoría', 'Cantidad', 'Base'],
    ...(snapshot.productos ?? []).map((item) => [
      item.codigo ?? '',
      item.producto,
      item.grupo,
      String(item.cantidad),
      money(item.base).toFixed(2),
    ]),
  ];

  const groupRows: string[][] = [
    ['Grupo / categoría', 'Cantidad', 'Base'],
    ...(snapshot.grupos ?? []).map((item) => [
      item.grupo,
      String(item.cantidad),
      money(item.base).toFixed(2),
    ]),
  ];

  const files = [
    {
      name: '[Content_Types].xml',
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Formas de pago" sheetId="2" r:id="rId2"/><sheet name="Consumo productos" sheetId="3" r:id="rId3"/><sheet name="Grupos" sheetId="4" r:id="rId4"/><sheet name="Operaciones" sheetId="5" r:id="rId5"/></sheets></workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/></Relationships>',
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: Buffer.from(worksheet(summaryRows)),
    },
    {
      name: 'xl/worksheets/sheet2.xml',
      content: Buffer.from(worksheet(paymentRows)),
    },
    {
      name: 'xl/worksheets/sheet3.xml',
      content: Buffer.from(worksheet(productRows)),
    },
    {
      name: 'xl/worksheets/sheet4.xml',
      content: Buffer.from(worksheet(groupRows)),
    },
    {
      name: 'xl/worksheets/sheet5.xml',
      content: Buffer.from(worksheet(operationRows)),
    },
  ];
  return zipStore(files);
}

function pdfEscape(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function generarPdfDesdeLineas(lines: string[], tituloVacio: string) {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 45) pages.push(lines.slice(i, i + 45));
  if (pages.length === 0) pages.push([tituloVacio]);

  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageIds = pages.map((_, i) => 3 + i * 2);
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  );

  for (let i = 0; i < pages.length; i += 1) {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const pageContent = [
      'BT',
      '/F1 9 Tf',
      '40 790 Td',
      ...pages[i].flatMap((line, index) => [
        index === 0 ? '' : '0 -16 Td',
        `(${pdfEscape(line.slice(0, 115))}) Tj`,
      ]),
      'ET',
    ]
      .filter(Boolean)
      .join('\n');

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(pageContent, 'utf8')} >>\nstream\n${pageContent}\nendstream`,
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

export function generarPdfSimple(snapshot: CierreTurnoSnapshot) {
  const r = snapshot.restaurante;
  const lines = [
    'SIGR - REPORTE PREVIO DE CIERRE',
    'DOCUMENTO INTERNO ADMINISTRATIVO',
    r?.razonSocial || r?.nombre
      ? `Razón social: ${r?.razonSocial ?? r?.nombre ?? ''}`
      : '',
    r?.nombre ? `Nombre comercial: ${r.nombre}` : '',
    r?.nit ? `NIT: ${r.nit}${r.dv ? `-${r.dv}` : ''}` : '',
    r?.direccion ? `Dirección: ${r.direccion}` : '',
    [r?.municipio, r?.departamento].filter(Boolean).length
      ? `Ubicación: ${[r?.municipio, r?.departamento].filter(Boolean).join(' / ')}`
      : '',
    r?.telefono ? `Teléfono: ${r.telefono}` : '',
    '',
    `Sucursal: ${snapshot.caja.sucursal}`,
    `Caja / turno: ${snapshot.caja.nombre}`,
    `Cajero: ${snapshot.caja.cajero ?? '-'}`,
    `Apertura: ${snapshot.caja.fechaApertura}`,
    `Generado: ${snapshot.caja.generadoEn}`,
    `Base inicial: ${(snapshot.caja.saldoInicial ?? 0).toFixed(2)}`,
    '',
    'RESUMEN COMERCIAL',
    `Primer comprobante interno: ${snapshot.resumen.primerComprobanteInterno ?? '-'}`,
    `Último comprobante interno: ${snapshot.resumen.ultimoComprobanteInterno ?? '-'}`,
    `Operaciones: ${snapshot.resumen.operaciones}`,
    `Subtotal / base ventas: ${(snapshot.resumen.subtotalVentas ?? 0).toFixed(2)}`,
    `Descuentos: ${(snapshot.resumen.descuentos ?? 0).toFixed(2)}`,
    `IVA / otros impuestos: ${(snapshot.resumen.impuestos ?? 0).toFixed(2)}`,
    `Impoconsumo: ${(snapshot.resumen.impoconsumo ?? 0).toFixed(2)}`,
    `Propinas: ${(snapshot.resumen.propinas ?? 0).toFixed(2)}`,
    `Domicilios: ${(snapshot.resumen.domicilios ?? 0).toFixed(2)}`,
    `Total ventas: ${snapshot.resumen.totalVentas.toFixed(2)}`,
    '',
    'FORMAS DE PAGO',
    ...(snapshot.formasPago?.length
      ? snapshot.formasPago.map(
          (item) =>
            `${item.metodo} (${item.tipo}) bruto ${item.bruto.toFixed(2)} devoluciones ${item.devoluciones.toFixed(2)} neto ${item.neto.toFixed(2)}`,
        )
      : [
          `Efectivo neto: ${snapshot.resumen.efectivo.toFixed(2)}`,
          `Otros medios netos: ${snapshot.resumen.otrosPagos.toFixed(2)}`,
        ]),
    `Pagos brutos: ${snapshot.resumen.totalPagos.toFixed(2)}`,
    `Devoluciones: ${snapshot.resumen.totalDevoluciones.toFixed(2)}`,
    `Cobrado neto: ${snapshot.resumen.totalNetoCobrado.toFixed(2)}`,
    '',
    'CAJA',
    `Ingresos manuales: ${(snapshot.resumen.totalIngresos ?? 0).toFixed(2)}`,
    `Egresos manuales: ${(snapshot.resumen.totalEgresos ?? 0).toFixed(2)}`,
    `Efectivo esperado: ${(snapshot.resumen.efectivoEsperado ?? 0).toFixed(2)}`,
    '',
    'TOTALES POR GRUPO / CATEGORÍA',
    ...(snapshot.grupos?.length
      ? snapshot.grupos.map(
          (item) =>
            `${item.grupo}: cantidad ${item.cantidad} base ${item.base.toFixed(2)}`,
        )
      : ['Sin agrupación disponible']),
    '',
    'CONSUMO DE PRODUCTOS',
    ...(snapshot.productos?.length
      ? snapshot.productos.map(
          (item) =>
            `${item.codigo ? `${item.codigo} ` : ''}${item.producto} | ${item.grupo} | cant ${item.cantidad} | base ${item.base.toFixed(2)}`,
        )
      : ['Sin productos en el turno']),
    '',
    'DETALLE DE OPERACIONES',
    ...snapshot.ventas.flatMap((venta) => [
      `#${venta.ventaId} ${venta.fechaOperacion} total ${venta.total.toFixed(2)} ${venta.facturaInterna ?? ''}`.trim(),
      ...venta.detalles.map(
        (detalle) =>
          `  ${detalle.cantidad} x ${detalle.producto} @ ${detalle.precioUnitario.toFixed(2)} = ${detalle.subtotal.toFixed(2)}`,
      ),
    ]),
    '',
    'Este reporte no es factura ni documento equivalente electrónico y no acredita validación DIAN.',
  ];

  return generarPdfDesdeLineas(
    lines,
    'SIGR - Reporte previo al cierre de turno',
  );
}

export function generarPdfCierreFinal(data: {
  cajaId: number;
  cajaNombre: string;
  sucursal: string;
  fechaApertura: Date;
  fechaCierre: Date;
  saldoInicial: number;
  saldoEsperado: number;
  saldoContado: number;
  diferencia: number;
  totalEfectivoSistema: number;
  totalOtrosPagos: number;
  totalIngresos: number;
  totalEgresos: number;
  observacionCierre: string | null;
  cerradoPor: string;
  snapshot: CierreTurnoSnapshot | null;
}) {
  const snapshot = data.snapshot;
  const r = snapshot?.restaurante;
  const lines = [
    'SIGR - TIRILLA FINAL DE CIERRE',
    'DOCUMENTO INTERNO ADMINISTRATIVO',
    r?.razonSocial || r?.nombre
      ? `Razón social: ${r?.razonSocial ?? r?.nombre ?? ''}`
      : '',
    r?.nombre ? `Nombre comercial: ${r.nombre}` : '',
    r?.nit ? `NIT: ${r.nit}${r.dv ? `-${r.dv}` : ''}` : '',
    r?.direccion ? `Dirección: ${r.direccion}` : '',
    '',
    `Caja / turno: ${data.cajaNombre} (#${data.cajaId})`,
    `Sucursal: ${data.sucursal}`,
    `Cajero de apertura: ${snapshot?.caja.cajero ?? '-'}`,
    `Apertura: ${data.fechaApertura.toISOString()}`,
    `Cierre: ${data.fechaCierre.toISOString()}`,
    `Cerrada por: ${data.cerradoPor}`,
    '',
    'ARQUEO',
    `Base inicial: ${data.saldoInicial.toFixed(2)}`,
    `Efectivo sistema: ${data.totalEfectivoSistema.toFixed(2)}`,
    `Otros medios: ${data.totalOtrosPagos.toFixed(2)}`,
    `Ingresos manuales: ${data.totalIngresos.toFixed(2)}`,
    `Egresos manuales: ${data.totalEgresos.toFixed(2)}`,
    `Efectivo esperado: ${data.saldoEsperado.toFixed(2)}`,
    `Efectivo contado: ${data.saldoContado.toFixed(2)}`,
    `Diferencia: ${data.diferencia.toFixed(2)}`,
    `Observación: ${data.observacionCierre ?? '-'}`,
    '',
    'RESUMEN DEL TURNO',
    ...(snapshot
      ? [
          `Primer comprobante interno: ${snapshot.resumen.primerComprobanteInterno ?? '-'}`,
          `Último comprobante interno: ${snapshot.resumen.ultimoComprobanteInterno ?? '-'}`,
          `Operaciones: ${snapshot.resumen.operaciones}`,
          `Subtotal / base ventas: ${(snapshot.resumen.subtotalVentas ?? 0).toFixed(2)}`,
          `Descuentos: ${(snapshot.resumen.descuentos ?? 0).toFixed(2)}`,
          `IVA / otros impuestos: ${(snapshot.resumen.impuestos ?? 0).toFixed(2)}`,
          `Impoconsumo: ${(snapshot.resumen.impoconsumo ?? 0).toFixed(2)}`,
          `Propinas: ${(snapshot.resumen.propinas ?? 0).toFixed(2)}`,
          `Domicilios: ${(snapshot.resumen.domicilios ?? 0).toFixed(2)}`,
          `Total ventas: ${snapshot.resumen.totalVentas.toFixed(2)}`,
          `Devoluciones: ${snapshot.resumen.totalDevoluciones.toFixed(2)}`,
          `Cobrado neto: ${snapshot.resumen.totalNetoCobrado.toFixed(2)}`,
        ]
      : ['Snapshot previo no disponible']),
    '',
    'FORMAS DE PAGO',
    ...(snapshot?.formasPago?.length
      ? snapshot.formasPago.map(
          (item) => `${item.metodo}: neto ${item.neto.toFixed(2)}`,
        )
      : ['Desglose no disponible']),
    '',
    'TOTALES POR GRUPO / CATEGORÍA',
    ...(snapshot?.grupos?.length
      ? snapshot.grupos.map(
          (item) =>
            `${item.grupo}: cantidad ${item.cantidad} base ${item.base.toFixed(2)}`,
        )
      : ['Desglose no disponible']),
    '',
    'Documento interno administrativo. No es factura ni documento equivalente electrónico.',
    'No acredita validación ni aceptación DIAN.',
  ];

  return generarPdfDesdeLineas(lines, 'SIGR - TIRILLA FINAL DE CIERRE');
}
