import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CartaDiaService } from './carta-dia.service';

@Controller('media/cartas')
export class CartaMediaController {
  constructor(private readonly service: CartaDiaService) {}

  @Get(':restauranteId/:archivo')
  async recurso(
    @Param('restauranteId', ParseIntPipe) restauranteId: number,
    @Param('archivo') archivo: string,
    @Res() response: Response,
  ) {
    const recurso = await this.service.leerRecurso(restauranteId, archivo);
    response.setHeader('Content-Type', recurso.mime);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.send(recurso.contenido);
  }
}
