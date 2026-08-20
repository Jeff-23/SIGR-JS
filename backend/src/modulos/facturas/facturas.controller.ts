import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { CreateFacturaVentaDto } from './dto/create-factura-venta.dto';
import { FacturasService } from './facturas.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('facturas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  @Post()
  @Permisos('FACTURAS_EMITIR')
  createLegacy(
    @Body() data: CreateFacturaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.facturasService.createLegacy(data, request.user);
  }

  @Post('venta')
  @Permisos('FACTURAS_EMITIR')
  crearDesdeVenta(
    @Body() data: CreateFacturaVentaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.facturasService.crearDesdeVenta(data.ventaId, request.user);
  }

  @Get()
  @Permisos('FACTURAS_VER')
  listar(@Req() request: RequestAutenticada) {
    return this.facturasService.listar(request.user);
  }

  @Get(':id')
  @Permisos('FACTURAS_VER')
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.facturasService.obtener(id, request.user);
  }

  @Get(':id/representacion-impresa')
  @Permisos('FACTURAS_VER')
  representacionImpresa(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.facturasService.representacionImpresa(id, request.user);
  }
}
