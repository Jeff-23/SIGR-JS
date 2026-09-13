import { Injectable } from '@nestjs/common';
import { PerfilFiscal } from '@prisma/client';
import {
  ProveedorFiscalAdapter,
  ResultadoProveedorFiscal,
} from '../proveedor-fiscal.types';

/**
 * Adaptador MATÍAS preparado para el contrato definitivo de API.
 *
 * Antes de la reunión técnica no se inventan endpoints, headers, payloads ni
 * semántica de webhooks. Por seguridad, transmitir/consultar permanecen
 * bloqueados hasta completar ese contrato y conectar un resolvedor de secretos.
 */
@Injectable()
export class MatiasFiscalAdapter implements ProveedorFiscalAdapter {
  readonly codigo = 'MATIAS';

  diagnosticar(perfil: PerfilFiscal): Promise<{
    disponible: boolean;
    mensaje: string;
  }> {
    const faltantes: string[] = [];
    if (perfil.modoOperacion !== 'SOFTWARE_PROPIO')
      faltantes.push('modo SOFTWARE_PROPIO');
    if (!perfil.softwareIdRef) faltantes.push('Software ID');
    if (!perfil.pinSoftwareRef) faltantes.push('PIN del software');
    if (!perfil.credencialRef) faltantes.push('credencial API');
    if (!perfil.certificadoRef) faltantes.push('certificado digital');

    if (faltantes.length) {
      return Promise.resolve({
        disponible: false,
        mensaje: `MATÍAS preparado; faltan referencias seguras: ${faltantes.join(', ')}`,
      });
    }

    return Promise.resolve({
      disponible: false,
      mensaje:
        'MATÍAS configurado estructuralmente. Transmisión bloqueada hasta confirmar contrato API, Sandbox y credenciales reales.',
    });
  }

  transmitir(): Promise<ResultadoProveedorFiscal> {
    return Promise.reject(
      new Error(
        'MATÍAS aún no está habilitado para transmisión: falta confirmar el contrato API oficial y conectar Sandbox.',
      ),
    );
  }

  consultar(): Promise<ResultadoProveedorFiscal> {
    return Promise.reject(
      new Error(
        'MATÍAS aún no está habilitado para consulta: falta confirmar el contrato API oficial y conectar Sandbox.',
      ),
    );
  }
}
