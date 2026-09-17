import { PrismaService } from '../../prisma/prisma.service';

export type ImagenProductoDb = {
  id: number;
  productoId: number;
  restauranteId: number;
  tokenPublico: string;
  nombreOriginal: string;
  mimeOriginal: string;
  bytesOriginales: number;
  anchoOriginal: number;
  altoOriginal: number;
  hashSha256: string;
  focoX: number;
  focoY: number;
  zoom: unknown;
  estado: 'ACTIVA' | 'PENDIENTE_ELIMINACION' | 'ELIMINADA';
  creadoEn: Date;
  actualizadoEn: Date;
};

type ImagenProductoDelegate = {
  findUnique(args: Record<string, unknown>): Promise<ImagenProductoDb | null>;
  findMany(args: Record<string, unknown>): Promise<ImagenProductoDb[]>;
  upsert(args: Record<string, unknown>): Promise<ImagenProductoDb>;
  delete(args: Record<string, unknown>): Promise<ImagenProductoDb>;
};

export function imagenProductoDb(
  prisma: PrismaService,
): ImagenProductoDelegate {
  return (prisma as unknown as { imagenProducto: ImagenProductoDelegate })
    .imagenProducto;
}
