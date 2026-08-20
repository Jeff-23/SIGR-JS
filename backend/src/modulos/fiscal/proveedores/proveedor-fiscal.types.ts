import { DocumentoElectronico, PerfilFiscal } from '@prisma/client';

export type ResultadoProveedorFiscal = {
  estado: 'RECIBIDO' | 'ACEPTADO' | 'RECHAZADO' | 'PENDIENTE';
  referencia: string;
  mensaje?: string;
  cufe?: string;
  qrCode?: string;
  respuesta: Record<string, unknown>;
};

export type DocumentoParaProveedor = DocumentoElectronico & {
  factura: { venta: { sucursal: { restauranteId: number } } | null };
};

export interface ProveedorFiscalAdapter {
  readonly codigo: string;
  diagnosticar(perfil: PerfilFiscal): Promise<{
    disponible: boolean;
    mensaje: string;
  }>;
  transmitir(
    documento: DocumentoParaProveedor,
    perfil: PerfilFiscal,
  ): Promise<ResultadoProveedorFiscal>;
  consultar(
    referencia: string,
    perfil: PerfilFiscal,
  ): Promise<ResultadoProveedorFiscal>;
}
