import { Injectable } from '@nestjs/common';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';

import type {
  MensajeDistribucion,
  ProveedorEmailCierre,
  ResultadoEnvio,
} from './cierre-distribucion.types';

type SmtpSocket = Socket | tls.TLSSocket;

function envolverBase64(value: Buffer | string) {
  const encoded = Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value, 'utf8').toString('base64');
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function escaparData(value: string) {
  return value.replace(/(^|\r\n)\./g, '$1..');
}

@Injectable()
export class SmtpCierreEmailProvider implements ProveedorEmailCierre {
  disponible() {
    return Boolean(
      process.env.CIERRE_SMTP_HOST?.trim() &&
      process.env.CIERRE_SMTP_FROM?.trim(),
    );
  }

  async enviar(mensaje: MensajeDistribucion): Promise<ResultadoEnvio> {
    const host = process.env.CIERRE_SMTP_HOST?.trim();
    const from = process.env.CIERRE_SMTP_FROM?.trim();
    if (!host || !from) {
      throw Object.assign(new Error('SMTP de cierres no configurado'), {
        code: 'PROVEEDOR_NO_CONFIGURADO',
      });
    }
    const port = Number(process.env.CIERRE_SMTP_PORT || '587');
    const secure =
      String(process.env.CIERRE_SMTP_SECURE || '').toLowerCase() === 'true' ||
      port === 465;
    const user = process.env.CIERRE_SMTP_USER?.trim();
    const pass = process.env.CIERRE_SMTP_PASS ?? '';
    const messageId = `<${randomUUID()}@sigr.local>`;

    let socket: SmtpSocket = await this.conectar(host, port, secure);
    try {
      await this.esperar(socket, [220]);
      await this.comando(socket, `EHLO sigr.local`, [250]);

      if (
        !secure &&
        (port === 587 ||
          String(process.env.CIERRE_SMTP_STARTTLS || '').toLowerCase() ===
            'true')
      ) {
        await this.comando(socket, 'STARTTLS', [220]);
        socket = await this.actualizarTls(socket, host);
        await this.comando(socket, 'EHLO sigr.local', [250]);
      }

      if (user) {
        await this.comando(socket, 'AUTH LOGIN', [334]);
        await this.comando(socket, Buffer.from(user).toString('base64'), [334]);
        await this.comando(socket, Buffer.from(pass).toString('base64'), [235]);
      }

      await this.comando(socket, `MAIL FROM:<${from}>`, [250]);
      await this.comando(socket, `RCPT TO:<${mensaje.destino}>`, [250, 251]);
      await this.comando(socket, 'DATA', [354]);
      socket.write(
        `${escaparData(this.construirMime(from, mensaje, messageId))}\r\n.\r\n`,
      );
      await this.esperar(socket, [250]);
      await this.comando(socket, 'QUIT', [221]);
      return { referencia: messageId };
    } finally {
      socket.destroy();
    }
  }

  private conectar(
    host: string,
    port: number,
    secure: boolean,
  ): Promise<SmtpSocket> {
    return new Promise((resolve, reject) => {
      const socket = secure
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(
          Object.assign(new Error('Timeout conectando al SMTP'), {
            code: 'SMTP_TIMEOUT',
          }),
        );
      }, 12_000);
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.once(secure ? 'secureConnect' : 'connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
    });
  }

  private actualizarTls(
    socket: SmtpSocket,
    host: string,
  ): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const secured = tls.connect({ socket, servername: host });
      const timer = setTimeout(() => {
        secured.destroy();
        reject(
          Object.assign(new Error('Timeout iniciando TLS SMTP'), {
            code: 'SMTP_TLS_TIMEOUT',
          }),
        );
      }, 12_000);
      secured.once('error', (error: Error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('Error TLS SMTP'));
      });
      secured.once('secureConnect', () => {
        clearTimeout(timer);
        resolve(secured);
      });
    });
  }

  private comando(socket: SmtpSocket, command: string, codes: number[]) {
    socket.write(`${command}\r\n`);
    return this.esperar(socket, codes);
  }

  private esperar(socket: SmtpSocket, codes: number[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => {
        limpiar();
        reject(
          Object.assign(new Error('Timeout esperando respuesta SMTP'), {
            code: 'SMTP_TIMEOUT',
          }),
        );
      }, 12_000);
      const onError = (error: Error) => {
        limpiar();
        reject(error);
      };
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines: string[] = buffer.split(/\r?\n/).filter(Boolean);
        const last: string | undefined = lines[lines.length - 1];
        if (!last || !/^\d{3} /.test(last)) return;
        const code = Number(last.substring(0, 3));
        limpiar();
        if (codes.includes(code)) resolve(buffer);
        else
          reject(
            Object.assign(new Error(`SMTP respondió ${code}`), {
              code: `SMTP_${code}`,
            }),
          );
      };
      const limpiar = () => {
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', onError);
      };
      socket.on('data', onData);
      socket.on('error', onError);
    });
  }

  private construirMime(
    from: string,
    mensaje: MensajeDistribucion,
    messageId: string,
  ) {
    const boundary = `sigr-${randomUUID()}`;
    const headers = [
      `From: ${from}`,
      `To: ${mensaje.destino}`,
      `Subject: =?UTF-8?B?${Buffer.from(mensaje.asunto, 'utf8').toString('base64')}?=`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      envolverBase64(mensaje.texto),
    ];
    for (const archivo of mensaje.archivos) {
      headers.push(
        `--${boundary}`,
        `Content-Type: ${archivo.mime}; name="${archivo.nombre}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${archivo.nombre}"`,
        '',
        envolverBase64(archivo.contenido),
      );
    }
    headers.push(`--${boundary}--`, '');
    return headers.join('\r\n');
  }
}
