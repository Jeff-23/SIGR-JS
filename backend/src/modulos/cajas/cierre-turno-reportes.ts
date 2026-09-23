export type CierreTurnoSnapshot = {
  version: 1;
  caja: {
    id: number;
    nombre: string;
    sucursalId: number;
    sucursal: string;
    fechaApertura: string;
    generadoEn: string;
  };
  resumen: {
    operaciones: number;
    totalVentas: number;
    totalPagos: number;
    totalDevoluciones: number;
    totalNetoCobrado: number;
    efectivo: number;
    otrosPagos: number;
  };
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
      producto: string;
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

  const summaryRows = [
    ['Campo', 'Valor'],
    ['Caja', snapshot.caja.nombre],
    ['Sucursal', snapshot.caja.sucursal],
    ['Apertura', snapshot.caja.fechaApertura],
    ['Generado', snapshot.caja.generadoEn],
    ['Operaciones', String(snapshot.resumen.operaciones)],
    ['Total ventas', snapshot.resumen.totalVentas.toFixed(2)],
    ['Pagos brutos', snapshot.resumen.totalPagos.toFixed(2)],
    ['Devoluciones', snapshot.resumen.totalDevoluciones.toFixed(2)],
    ['Cobrado neto', snapshot.resumen.totalNetoCobrado.toFixed(2)],
    ['Efectivo', snapshot.resumen.efectivo.toFixed(2)],
    ['Otros pagos', snapshot.resumen.otrosPagos.toFixed(2)],
  ];

  const files = [
    {
      name: '[Content_Types].xml',
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
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
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Operaciones" sheetId="2" r:id="rId2"/></sheets></workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: Buffer.from(worksheet(summaryRows)),
    },
    {
      name: 'xl/worksheets/sheet2.xml',
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
  const lines = [
    `SIGR - Reporte previo al cierre de turno`,
    `Caja: ${snapshot.caja.nombre}`,
    `Sucursal: ${snapshot.caja.sucursal}`,
    `Apertura: ${snapshot.caja.fechaApertura}`,
    `Generado: ${snapshot.caja.generadoEn}`,
    `Operaciones: ${snapshot.resumen.operaciones}`,
    `Total ventas: ${snapshot.resumen.totalVentas.toFixed(2)}`,
    `Pagos brutos: ${snapshot.resumen.totalPagos.toFixed(2)}`,
    `Devoluciones: ${snapshot.resumen.totalDevoluciones.toFixed(2)}`,
    `Cobrado neto: ${snapshot.resumen.totalNetoCobrado.toFixed(2)}`,
    '',
    'Ventas:',
    ...snapshot.ventas.flatMap((venta) => [
      `#${venta.ventaId} ${venta.fechaOperacion} total ${venta.total.toFixed(2)} ${venta.facturaInterna ?? ''} ${venta.documentoElectronicoNumero ?? ''}`.trim(),
      ...venta.detalles.map(
        (detalle) =>
          `  ${detalle.cantidad} x ${detalle.producto} @ ${detalle.precioUnitario.toFixed(2)} = ${detalle.subtotal.toFixed(2)}`,
      ),
    ]),
    '',
    'RESUMEN FINAL',
    `Operaciones: ${snapshot.resumen.operaciones}`,
    `Total ventas: ${snapshot.resumen.totalVentas.toFixed(2)}`,
    `Pagos brutos: ${snapshot.resumen.totalPagos.toFixed(2)}`,
    `Devoluciones: ${snapshot.resumen.totalDevoluciones.toFixed(2)}`,
    `Cobrado neto: ${snapshot.resumen.totalNetoCobrado.toFixed(2)}`,
    `Efectivo: ${snapshot.resumen.efectivo.toFixed(2)}`,
    `Otros pagos: ${snapshot.resumen.otrosPagos.toFixed(2)}`,
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
  const lines = [
    'SIGR - TIRILLA FINAL DE CIERRE',
    `Caja: ${data.cajaNombre} (#${data.cajaId})`,
    `Sucursal: ${data.sucursal}`,
    `Apertura: ${data.fechaApertura.toISOString()}`,
    `Cierre: ${data.fechaCierre.toISOString()}`,
    `Cerrada por: ${data.cerradoPor}`,
    '',
    `Base inicial: ${data.saldoInicial.toFixed(2)}`,
    `Efectivo sistema: ${data.totalEfectivoSistema.toFixed(2)}`,
    `Otros medios: ${data.totalOtrosPagos.toFixed(2)}`,
    `Ingresos manuales: ${data.totalIngresos.toFixed(2)}`,
    `Egresos manuales: ${data.totalEgresos.toFixed(2)}`,
    `Efectivo esperado: ${data.saldoEsperado.toFixed(2)}`,
    `Efectivo contado: ${data.saldoContado.toFixed(2)}`,
    `Diferencia: ${data.diferencia.toFixed(2)}`,
    `Observacion: ${data.observacionCierre ?? '-'}`,
    '',
    'RESUMEN DEL TURNO',
    ...(data.snapshot
      ? [
          `Operaciones: ${data.snapshot.resumen.operaciones}`,
          `Total ventas: ${data.snapshot.resumen.totalVentas.toFixed(2)}`,
          `Pagos brutos: ${data.snapshot.resumen.totalPagos.toFixed(2)}`,
          `Devoluciones: ${data.snapshot.resumen.totalDevoluciones.toFixed(2)}`,
          `Cobrado neto: ${data.snapshot.resumen.totalNetoCobrado.toFixed(2)}`,
        ]
      : ['Snapshot previo no disponible']),
  ];

  return generarPdfDesdeLineas(lines, 'SIGR - TIRILLA FINAL DE CIERRE');
}
