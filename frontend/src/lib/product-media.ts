import { frontendConfig } from './config';

export type ProductImage = {
  restauranteId: number;
  productoId: number;
  tokenPublico: string;
  anchoOriginal?: number;
  altoOriginal?: number;
  focoX?: number;
  focoY?: number;
  zoom?: string | number;
};

export function productImageUrl(
  image: ProductImage | null | undefined,
  variant: 'thumb' | 'medium' | 'large' = 'thumb',
) {
  if (!image) return undefined;
  const base = frontendConfig.apiUrl.replace(/\/$/, '');
  return `${base}/media/productos/${image.restauranteId}/${image.productoId}/${image.tokenPublico}/${variant}`;
}
