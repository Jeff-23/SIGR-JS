import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import {
  construirContextoAuditoria,
  RequestAuditable,
} from '../auditoria/auditoria-contexto';
import { AuditoriaDetallada } from '../auditoria/auditoria-detallada.decorator';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { SucursalesService } from './sucursales.service';

@Controller('sucursales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditoriaDetallada()
export class SucursalesController {
  constructor(private readonly sucursalesService: SucursalesService) {}

  @Post()
  @Permisos('SUCURSALES_CREAR')
  create(
    @Body() createSucursalDto: CreateSucursalDto,
    @Req() request: RequestAuditable,
  ) {
    return this.sucursalesService.create(
      createSucursalDto,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Get()
  @Permisos('SUCURSALES_VER')
  findAll(@Req() request: RequestAuditable) {
    return this.sucursalesService.findAll(request.user);
  }

  @Get(':id')
  @Permisos('SUCURSALES_VER')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAuditable,
  ) {
    return this.sucursalesService.findOne(id, request.user);
  }

  @Patch(':id')
  @Permisos('SUCURSALES_EDITAR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSucursalDto: UpdateSucursalDto,
    @Req() request: RequestAuditable,
  ) {
    return this.sucursalesService.update(
      id,
      updateSucursalDto,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Delete(':id')
  @Permisos('SUCURSALES_EDITAR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAuditable,
  ) {
    return this.sucursalesService.remove(
      id,
      request.user,
      construirContextoAuditoria(request),
    );
  }
}
