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
import { Capacidades } from '../auth/capacidades.decorator';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { AbastecimientoService } from './abastecimiento.service';
import {
  ConvertirSolicitudDto,
  CrearProveedorDto,
  CrearSolicitudCompraDto,
  PrecioProveedorDto,
  RecibirOrdenDto,
} from './dto/abastecimiento.dto';
type AuthRequest = { user: UsuarioAutenticado };

@Controller('abastecimiento')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Capacidades('ABASTECIMIENTO')
export class AbastecimientoController {
  constructor(private readonly service: AbastecimientoService) {}
  @Get('proveedores') @Permisos('INVENTARIO_VER') proveedores(
    @Req() req: AuthRequest,
  ) {
    return this.service.proveedores(req.user);
  }
  @Post('proveedores') @Permisos('INVENTARIO_AJUSTAR') crearProveedor(
    @Body() dto: CrearProveedorDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crearProveedor(dto, req.user);
  }
  @Post('proveedores/:id/precios') @Permisos('INVENTARIO_AJUSTAR') precio(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrecioProveedorDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.guardarPrecio(id, dto, req.user);
  }
  @Get('solicitudes') @Permisos('INVENTARIO_VER') solicitudes(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: AuthRequest,
  ) {
    return this.service.solicitudes(sucursalId, req.user);
  }
  @Post('solicitudes') @Permisos('INVENTARIO_AJUSTAR') crearSolicitud(
    @Body() dto: CrearSolicitudCompraDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crearSolicitud(dto, req.user);
  }
  @Post('solicitudes/:id/convertir') @Permisos('INVENTARIO_AJUSTAR') convertir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertirSolicitudDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.convertir(id, dto, req.user);
  }
  @Get('ordenes') @Permisos('INVENTARIO_VER') ordenes(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: AuthRequest,
  ) {
    return this.service.ordenes(sucursalId, req.user);
  }
  @Post('ordenes/:id/recepciones') @Permisos('INVENTARIO_AJUSTAR') recibir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecibirOrdenDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.recibir(id, dto, req.user);
  }
}
