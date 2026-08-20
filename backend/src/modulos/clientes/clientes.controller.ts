import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ClientesService } from './clientes.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto';
import { CambiarEstadoClienteDto } from './dto/cambiar-estado-cliente.dto';
import { ListarClientesDto } from './dto/listar-clientes.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Capacidades } from '../auth/capacidades.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('clientes')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Capacidades('CLIENTES')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @Permisos('CLIENTES_CREAR')
  crear(@Body() data: CrearClienteDto, @Req() request: RequestAutenticada) {
    return this.clientesService.crear(data, request.user);
  }

  @Get()
  @Permisos('CLIENTES_VER')
  listar(
    @Query() filtros: ListarClientesDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.clientesService.listar(filtros, request.user);
  }

  @Get(':id')
  @Permisos('CLIENTES_VER')
  obtenerPorId(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.clientesService.obtenerPorId(id, request.user);
  }

  @Patch(':id')
  @Permisos('CLIENTES_EDITAR')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ActualizarClienteDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.clientesService.actualizar(id, data, request.user);
  }

  @Patch(':id/estado')
  @Permisos('CLIENTES_DESACTIVAR')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarEstadoClienteDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.clientesService.cambiarEstado(id, data, request.user);
  }
}
