import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve, sep } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { imagenProductoDb } from './imagenes-producto.prisma';
import {
  calcularRecorteCuadrado,
  firmaImagenValida,
} from './imagenes-producto.utils';

export type ArchivoImagenProducto = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type EncuadreImagenProducto = {
  focoX?: number;
  focoY?: number;
  zoom?: number;
};

interface SharpLike {
  rotate(): SharpLike;
  extract(region: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): SharpLike;
  resize(
    width: number,
    height: number,
    options?: { fit?: 'cover'; withoutEnlargement?: boolean },
  ): SharpLike;
  webp(options?: { quality?: number; effort?: number }): SharpLike;
  toBuffer(): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Buffer;
    info: { width: number; height: number };
  }>;
}

type SharpFactory = (
  input: Buffer,
  options?: { limitInputPixels?: number },
) => SharpLike;

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;
const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VARIANTES = {
  thumb: 240,
  medium: 800,
  large: 1400,
} as const;

@Injectable()
export class ImagenesProductoService {
  private readonly storage = this.resolverDirectorio();
  private colaProcesamiento: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  async guardar(
    productoId: number,
    archivo: ArchivoImagenProducto,
    encuadre: EncuadreImagenProducto,
    usuario: UsuarioAutenticado,
  ) {
    const alcance = await this.productoEnAlcance(productoId, usuario);
    this.validarArchivo(archivo);

    const liberarTurno = await this.reservarProcesamiento();
    try {
      const focoX = this.normalizarPorcentaje(encuadre.focoX, 50);
      const focoY = this.normalizarPorcentaje(encuadre.focoY, 50);
      const zoom = this.normalizarZoom(encuadre.zoom);
      const sharp = this.cargarSharp();

      let normalizada: Buffer;
      let ancho: number;
      let alto: number;
      try {
        const salida = await sharp(archivo.buffer, {
          limitInputPixels: MAX_PIXELS,
        })
          .rotate()
          .toBuffer({ resolveWithObject: true });
        normalizada = salida.data;
        ancho = salida.info.width;
        alto = salida.info.height;
      } catch {
        throw new BadRequestException(
          'La imagen no pudo procesarse. Usa una foto JPG, PNG o WEBP válida.',
        );
      }

      if (!ancho || !alto || ancho * alto > MAX_PIXELS) {
        throw new BadRequestException(
          'La imagen supera la resolución permitida',
        );
      }

      const tokenPublico = randomUUID();
      const destino = this.directorioVersion(
        alcance.restauranteId,
        productoId,
        tokenPublico,
      );
      await mkdir(destino, { recursive: true });

      const hashSha256 = createHash('sha256')
        .update(archivo.buffer)
        .update(`:${focoX}:${focoY}:${zoom}`)
        .digest('hex');

      try {
        const recorte = calcularRecorteCuadrado(
          ancho,
          alto,
          focoX,
          focoY,
          zoom,
        );
        for (const [nombre, tamano] of Object.entries(VARIANTES)) {
          const salida = await sharp(normalizada)
            .extract(recorte)
            .resize(tamano, tamano, { fit: 'cover' })
            .webp({ quality: nombre === 'large' ? 84 : 82, effort: 4 })
            .toBuffer();
          await writeFile(resolve(destino, `${nombre}.webp`), salida, {
            flag: 'wx',
          });
        }

        const media = imagenProductoDb(this.prisma);
        const anterior = await media.findUnique({
          where: { productoId },
          select: { tokenPublico: true, restauranteId: true },
        });

        const imagen = await media.upsert({
          where: { productoId },
          create: {
            productoId,
            restauranteId: alcance.restauranteId,
            tokenPublico,
            nombreOriginal: this.nombreSeguro(archivo.originalname),
            mimeOriginal: archivo.mimetype,
            bytesOriginales: archivo.size,
            anchoOriginal: ancho,
            altoOriginal: alto,
            hashSha256,
            focoX,
            focoY,
            zoom,
          },
          update: {
            restauranteId: alcance.restauranteId,
            tokenPublico,
            nombreOriginal: this.nombreSeguro(archivo.originalname),
            mimeOriginal: archivo.mimetype,
            bytesOriginales: archivo.size,
            anchoOriginal: ancho,
            altoOriginal: alto,
            hashSha256,
            focoX,
            focoY,
            zoom,
            estado: 'ACTIVA',
          },
        });

        if (anterior) {
          await this.eliminarVersion(
            anterior.restauranteId,
            productoId,
            anterior.tokenPublico,
          );
        }
        return imagen;
      } catch (error) {
        await rm(destino, { recursive: true, force: true });
        throw error;
      }
    } finally {
      liberarTurno();
    }
  }

  async eliminar(productoId: number, usuario: UsuarioAutenticado) {
    await this.productoEnAlcance(productoId, usuario);
    const media = imagenProductoDb(this.prisma);
    const imagen = await media.findUnique({
      where: { productoId },
    });
    if (!imagen) return { eliminado: false };

    await media.delete({ where: { productoId } });
    await this.eliminarVersion(
      imagen.restauranteId,
      productoId,
      imagen.tokenPublico,
    );
    return { eliminado: true };
  }

  async leerPublica(
    restauranteId: number,
    productoId: number,
    token: string,
    variante: keyof typeof VARIANTES,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(token) || !(variante in VARIANTES)) {
      throw new NotFoundException('Imagen no encontrada');
    }
    const archivo = resolve(
      this.directorioVersion(restauranteId, productoId, token),
      `${variante}.webp`,
    );
    this.validarRutaDentroStorage(archivo);
    try {
      return await readFile(archivo);
    } catch {
      throw new NotFoundException('Imagen no encontrada');
    }
  }

  private async productoEnAlcance(
    productoId: number,
    usuario: UsuarioAutenticado,
  ) {
    const producto = await this.prisma.producto.findFirst({
      where: {
        id: productoId,
        estado: true,
        categoria: {
          estado: true,
          sucursal: {
            estado: true,
            ...(usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null
              ? {}
              : { restauranteId: usuario.restauranteId ?? -1 }),
            ...(usuario.sucursalId !== null ? { id: usuario.sucursalId } : {}),
          },
        },
      },
      select: {
        id: true,
        categoria: {
          select: {
            sucursal: { select: { restauranteId: true } },
          },
        },
      },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return {
      id: producto.id,
      restauranteId: producto.categoria.sucursal.restauranteId,
    };
  }

  private validarArchivo(archivo: ArchivoImagenProducto) {
    if (!MIME_PERMITIDOS.has(archivo.mimetype)) {
      throw new BadRequestException('La foto debe ser JPG, PNG o WEBP');
    }
    if (archivo.size <= 0 || archivo.size > MAX_BYTES) {
      throw new BadRequestException('La foto debe pesar máximo 12 MB');
    }
    if (!firmaImagenValida(archivo.mimetype, archivo.buffer)) {
      throw new BadRequestException(
        'El contenido de la imagen no coincide con su tipo declarado',
      );
    }
  }

  private normalizarPorcentaje(valor: number | undefined, fallback: number) {
    if (valor === undefined || !Number.isFinite(valor)) return fallback;
    return Math.max(0, Math.min(100, Math.round(valor)));
  }

  private normalizarZoom(valor: number | undefined) {
    if (valor === undefined || !Number.isFinite(valor)) return 1;
    return Math.max(1, Math.min(2.5, Math.round(valor * 100) / 100));
  }

  private cargarSharp(): SharpFactory {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('sharp') as SharpFactory;
    } catch {
      throw new Error(
        'Procesamiento de imágenes no disponible: instala la dependencia sharp',
      );
    }
  }

  private async reservarProcesamiento() {
    let liberar!: () => void;
    const turno = new Promise<void>((resolveTurno) => {
      liberar = resolveTurno;
    });
    const anterior = this.colaProcesamiento;
    this.colaProcesamiento = anterior.then(() => turno);
    await anterior;
    return liberar;
  }

  private resolverDirectorio() {
    const configurado = process.env.MEDIA_STORAGE_DIR?.trim();
    return configurado
      ? isAbsolute(configurado)
        ? configurado
        : resolve(process.cwd(), configurado)
      : resolve(process.cwd(), 'storage', 'media');
  }

  private directorioVersion(
    restauranteId: number,
    productoId: number,
    token: string,
  ) {
    const ruta = resolve(
      this.storage,
      `restaurante-${restauranteId}`,
      `producto-${productoId}`,
      token,
    );
    this.validarRutaDentroStorage(ruta);
    return ruta;
  }

  private validarRutaDentroStorage(ruta: string) {
    const raiz = resolve(this.storage) + sep;
    const normalizada = resolve(ruta);
    if (!normalizada.startsWith(raiz)) {
      throw new BadRequestException('Ruta de media inválida');
    }
  }

  private eliminarVersion(
    restauranteId: number,
    productoId: number,
    token: string,
  ) {
    return rm(this.directorioVersion(restauranteId, productoId, token), {
      recursive: true,
      force: true,
    });
  }

  private nombreSeguro(nombre: string) {
    return (
      basename(nombre)
        .normalize('NFKC')
        .replace(/[^a-zA-Z0-9 ._()\-áéíóúÁÉÍÓÚñÑ]/g, '_')
        .slice(0, 255) || 'foto'
    );
  }
}
