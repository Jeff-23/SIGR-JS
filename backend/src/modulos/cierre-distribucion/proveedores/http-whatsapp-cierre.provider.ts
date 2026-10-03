import { Injectable } from '@nestjs/common';

import type {
  MensajeDistribucion,
  ProveedorWhatsAppCierre,
  ResultadoEnvio,
} from './cierre-distribucion.types';

@Injectable()
export class HttpWhatsAppCierreProvider implements ProveedorWhatsAppCierre {
  disponible() {
    return Boolean(process.env.CIERRE_WHATSAPP_BRIDGE_URL?.trim());
  }

  async enviar(mensaje: MensajeDistribucion): Promise<ResultadoEnvio> {
    const url = process.env.CIERRE_WHATSAPP_BRIDGE_URL?.trim();
    if (!url) {
      throw Object.assign(new Error('Proveedor de WhatsApp no configurado'), {
        code: 'PROVEEDOR_NO_CONFIGURADO',
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.CIERRE_WHATSAPP_BRIDGE_TOKEN
            ? {
                authorization: `Bearer ${process.env.CIERRE_WHATSAPP_BRIDGE_TOKEN}`,
              }
            : {}),
        },
        body: JSON.stringify({
          destino: mensaje.destino,
          texto: mensaje.texto,
          archivos: mensaje.archivos.map((archivo) => ({
            nombre: archivo.nombre,
            mime: archivo.mime,
            base64: archivo.contenido.toString('base64'),
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw Object.assign(
          new Error(`Bridge WhatsApp respondió ${response.status}`),
          {
            code: `WHATSAPP_HTTP_${response.status}`,
          },
        );
      }
      const data = (await response.json().catch(() => ({}))) as {
        referencia?: string;
      };
      return { referencia: data.referencia };
    } finally {
      clearTimeout(timer);
    }
  }
}
