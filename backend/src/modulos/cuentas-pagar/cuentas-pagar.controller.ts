import {
  Body,
  Controller,
  Get,
  Headers,
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
import { CuentasPagarService } from './cuentas-pagar.service';
import {
  CrearCierreAdministrativoDto,
  CrearFacturaProveedorDto,
  FiltroContabilidadDto,
  FiltroCuentaProveedorDto,
  RegistrarAbonoProveedorDto,
} from './dto/cuentas-pagar.dto';
type AuthRequest = { user: UsuarioAutenticado };
@Controller('cuentas-pagar')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Capacidades('INVENTARIO')
export class CuentasPagarController {
  constructor(private readonly service: CuentasPagarService) {}
  @Get('facturas') @Permisos('REPORTES_VER') listar(
    @Query() dto: FiltroCuentaProveedorDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.listar(dto, req.user);
  }
  @Post('facturas') @Permisos('INVENTARIO_AJUSTAR') crear(
    @Body() dto: CrearFacturaProveedorDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crear(dto, req.user);
  }
  @Post('facturas/:id/abonos') @Permisos('INVENTARIO_AJUSTAR') abonar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarAbonoProveedorDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.service.abonar(id, dto, key, req.user);
  }
  @Post('cierres') @Permisos('INVENTARIO_AJUSTAR') cerrar(
    @Body() dto: CrearCierreAdministrativoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.cerrar(dto, req.user);
  }
  @Get('reporte') @Permisos('REPORTES_VER') reporte(
    @Query() dto: FiltroContabilidadDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.reporte(dto, req.user);
  }
}
