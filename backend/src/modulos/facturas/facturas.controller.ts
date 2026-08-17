import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { FacturasService } from './facturas.service';
import { CreateFacturaDto } from './dto/create-factura.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('facturas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacturasController {
  constructor(
    private readonly facturasService: FacturasService,
  ) {}

  @Post()
  @Roles('ADMIN', 'CAJERO')
  create(
    @Body() createFacturaDto: CreateFacturaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.facturasService.create(
      createFacturaDto,
      request.user,
    );
  }

  @Get('corte-caja')
  @Roles('ADMIN')
  obtenerCorteCaja(
    @Query('inicio') inicio: string | undefined,
    @Query('fin') fin: string | undefined,
    @Req() request: RequestAutenticada,
  ) {
    return this.facturasService.obtenerCorteCaja(
      inicio,
      fin,
      request.user,
    );
  }

  @Post(':id/emitir-dian')
  @Roles('ADMIN', 'CAJERO')
  emitirDian(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.facturasService.emitirDian(
      id,
      request.user,
    );
  }
}