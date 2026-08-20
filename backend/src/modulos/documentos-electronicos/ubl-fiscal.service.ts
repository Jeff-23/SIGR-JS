import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type DatosFacturaUbl = {
  numero: string;
  fecha: Date;
  proveedor: { nit: string; nombre: string };
  adquirente: { documento: string; nombre: string };
  subtotal: Prisma.Decimal;
  impuestos: Prisma.Decimal;
  total: Prisma.Decimal;
  detalles: Array<{
    codigo: number;
    nombre: string;
    cantidad: number;
    precio: Prisma.Decimal;
    subtotal: Prisma.Decimal;
  }>;
};

@Injectable()
export class UblFiscalService {
  generarBorradorFactura(datos: DatosFacturaUbl) {
    const lineas = datos.detalles
      .map(
        (detalle, indice) =>
          `<cac:InvoiceLine><cbc:ID>${indice + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="EA">${detalle.cantidad}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="COP">${detalle.subtotal.toFixed(2)}</cbc:LineExtensionAmount><cac:Item><cbc:Description>${this.xml(detalle.nombre)}</cbc:Description><cac:SellersItemIdentification><cbc:ID>${detalle.codigo}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount currencyID="COP">${detalle.precio.toFixed(2)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID><cbc:CustomizationID>DIAN 2.1</cbc:CustomizationID><cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID><cbc:ID>${this.xml(datos.numero)}</cbc:ID><cbc:IssueDate>${datos.fecha.toISOString().slice(0, 10)}</cbc:IssueDate><cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode><cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>${this.xml(datos.proveedor.nombre)}</cbc:RegistrationName><cbc:CompanyID>${this.xml(datos.proveedor.nit)}</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty><cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>${this.xml(datos.adquirente.nombre)}</cbc:RegistrationName><cbc:CompanyID>${this.xml(datos.adquirente.documento)}</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingCustomerParty><cac:TaxTotal><cbc:TaxAmount currencyID="COP">${datos.impuestos.toFixed(2)}</cbc:TaxAmount></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="COP">${datos.subtotal.toFixed(2)}</cbc:LineExtensionAmount><cbc:PayableAmount currencyID="COP">${datos.total.toFixed(2)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lineas}</Invoice>`;
  }

  private xml(valor: string) {
    return valor
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }
}
