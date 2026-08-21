import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';

export type ArchivoSoporte = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const TIPOS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);

@Injectable()
export class SoportesRegistroService {
  private readonly directorio = this.resolverDirectorio();
  private readonly limite = 5 * 1024 * 1024;

  private resolverDirectorio() {
    const configurado = process.env.SOPORTES_STORAGE_DIR?.trim();
    if (!configurado) return resolve(process.cwd(), 'storage', 'soportes');
    return isAbsolute(configurado)
      ? configurado
      : resolve(process.cwd(), configurado);
  }

  async guardar(archivo: ArchivoSoporte) {
    const extension = TIPOS.get(archivo.mimetype);
    if (!extension)
      throw new BadRequestException('El soporte debe ser JPG, PNG, WEBP o PDF');
    if (archivo.size <= 0 || archivo.size > this.limite) {
      throw new BadRequestException('El soporte debe pesar máximo 5 MB');
    }
    if (!this.firmaValida(archivo.mimetype, archivo.buffer)) {
      throw new BadRequestException(
        'El contenido del archivo no coincide con su tipo declarado',
      );
    }
    await mkdir(this.directorio, { recursive: true });
    const nombre = `${randomUUID()}${extension}`;
    await writeFile(resolve(this.directorio, nombre), archivo.buffer, {
      flag: 'wx',
    });
    return `soporte://${nombre}`;
  }

  async leer(referencia: string | null) {
    const nombre = this.nombreSeguro(referencia);
    try {
      const contenido = await readFile(resolve(this.directorio, nombre));
      return { contenido, tipo: this.tipo(extname(nombre)), nombre };
    } catch {
      throw new NotFoundException('Archivo de soporte no encontrado');
    }
  }

  async eliminar(referencia: string | null) {
    if (!referencia?.startsWith('soporte://')) return;
    const nombre = this.nombreSeguro(referencia);
    try {
      await unlink(resolve(this.directorio, nombre));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private nombreSeguro(referencia: string | null) {
    if (!referencia?.startsWith('soporte://'))
      throw new NotFoundException('El registro no tiene un archivo almacenado');
    const nombre = referencia.slice('soporte://'.length);
    if (!/^[a-f0-9-]+\.(jpg|png|webp|pdf)$/.test(nombre))
      throw new BadRequestException('Referencia de soporte inválida');
    return nombre;
  }

  private tipo(extension: string) {
    return (
      (
        {
          '.jpg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.pdf': 'application/pdf',
        } as Record<string, string>
      )[extension] ?? 'application/octet-stream'
    );
  }

  private firmaValida(tipo: string, contenido: Buffer) {
    if (tipo === 'application/pdf')
      return contenido.subarray(0, 5).toString() === '%PDF-';
    if (tipo === 'image/jpeg')
      return (
        contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff
      );
    if (tipo === 'image/png')
      return contenido
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (tipo === 'image/webp')
      return (
        contenido.subarray(0, 4).toString() === 'RIFF' &&
        contenido.subarray(8, 12).toString() === 'WEBP'
      );
    return false;
  }
}
