import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ImagenesProductoService } from './imagenes-producto.service';

@Controller('media/productos')
export class MediaProductoController {
  constructor(private readonly imagenes: ImagenesProductoService) {}

  @Get(':restauranteId/:productoId/:token/:variante')
  async imagen(
    @Param('restauranteId', ParseIntPipe) restauranteId: number,
    @Param('productoId', ParseIntPipe) productoId: number,
    @Param('token') token: string,
    @Param('variante') variante: 'thumb' | 'medium' | 'large',
    @Res() response: Response,
  ) {
    const contenido = await this.imagenes.leerPublica(
      restauranteId,
      productoId,
      token,
      variante,
    );
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Helmet aplica Cross-Origin-Resource-Policy: same-origin por defecto.
    // El frontend y el backend de SIGR viven en orígenes distintos (puertos
    // 5173/3000 en LAN y dominios separados en producción), por lo que los
    // <img> públicos serían bloqueados aunque CORS estuviera correctamente
    // configurado. Estas URLs usan tokens opacos/versionados y están pensadas
    // para POS y menú QR, así que permitimos explícitamente su consumo cross-origin.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.send(contenido);
  }
}
