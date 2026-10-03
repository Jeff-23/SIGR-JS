import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TipoMetodoPago } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/auditoria-contexto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarMetodoPagoRestauranteDto } from './dto/actualizar-metodo-pago-restaurante.dto';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';

@Injectable()
export class MetodosPagoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  async create(data: CreateMetodoPagoDto, usuarioActual: UsuarioAutenticado) {
    if (!this.esSuperadmin(usuarioActual)) {
      throw new ForbiddenException(
        'Solo el superadministrador de SIGR puede crear métodos de pago globales',
      );
    }

    return this.prisma.metodoPago.create({
      data: {
        nombre: data.nombre.trim(),
        tipo: data.tipo ?? TipoMetodoPago.OTRO,
      },
    });
  }

  async findAll(usuarioActual: UsuarioAutenticado) {
    if (this.esSuperadmin(usuarioActual)) {
      return this.prisma.metodoPago.findMany({
        where: { activo: true },
        orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      });
    }

    if (usuarioActual.restauranteId === null) {
      throw new ForbiddenException('El usuario no pertenece a un restaurante');
    }

    const asignaciones = await this.prisma.restauranteMetodoPago.findMany({
      where: { restauranteId: usuarioActual.restauranteId },
      include: { metodoPago: true },
      orderBy: [
        { metodoPago: { tipo: 'asc' } },
        { metodoPago: { nombre: 'asc' } },
      ],
    });

    return asignaciones
      .filter((item) => item.metodoPago.activo)
      .map((item) => ({
        ...item.metodoPago,
        activo: item.activo,
        activoGlobal: item.metodoPago.activo,
      }));
  }

  async actualizarConfiguracionRestaurante(
    metodoPagoId: number,
    data: ActualizarMetodoPagoRestauranteDto,
    usuarioActual: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    if (usuarioActual.restauranteId === null) {
      throw new ForbiddenException(
        'Selecciona un restaurante para administrar sus medios de pago',
      );
    }

    const metodo = await this.prisma.metodoPago.findFirst({
      where: { id: metodoPagoId, activo: true },
    });
    if (!metodo) throw new NotFoundException('Método de pago no encontrado');

    const anterior = await this.prisma.restauranteMetodoPago.findUnique({
      where: {
        restauranteId_metodoPagoId: {
          restauranteId: usuarioActual.restauranteId,
          metodoPagoId,
        },
      },
    });

    if (!anterior && !data.activo) {
      throw new BadRequestException(
        'El método de pago ya está deshabilitado para este restaurante',
      );
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const asignacion = await tx.restauranteMetodoPago.upsert({
        where: {
          restauranteId_metodoPagoId: {
            restauranteId: usuarioActual.restauranteId,
            metodoPagoId,
          },
        },
        update: { activo: data.activo },
        create: {
          restauranteId: usuarioActual.restauranteId,
          metodoPagoId,
          activo: data.activo,
        },
        include: { metodoPago: true },
      });

      await this.auditoria.registrar(
        tx,
        {
          accion: data.activo
            ? 'METODO_PAGO_RESTAURANTE_ACTIVADO'
            : 'METODO_PAGO_RESTAURANTE_DESACTIVADO',
          recurso: 'METODO_PAGO',
          recursoId: metodoPagoId,
          restauranteId: usuarioActual.restauranteId,
          antes: anterior,
          despues: asignacion,
        },
        contexto,
      );
      return asignacion;
    });

    return {
      ...actualizado.metodoPago,
      activo: actualizado.activo,
      activoGlobal: actualizado.metodoPago.activo,
    };
  }
}
