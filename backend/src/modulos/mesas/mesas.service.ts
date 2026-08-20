import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoMesa, EstadoPedido, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CreateMesaDto } from './dto/create-mesa.dto';

@Injectable()
export class MesasService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuario: UsuarioAutenticado) {
    return usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
  }

  private filtroSucursal(
    usuario: UsuarioAutenticado,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,
      ...(!this.esSuperadmin(usuario)
        ? { restauranteId: usuario.restauranteId }
        : {}),
      ...(usuario.sucursalId !== null ? { id: usuario.sucursalId } : {}),
    };
  }

  private async validarZonaDentroDelAlcance(
    zonaId: number,
    usuario: UsuarioAutenticado,
  ) {
    const zona = await this.prisma.zona.findFirst({
      where: {
        id: zonaId,
        estado: true,
        sucursal: this.filtroSucursal(usuario),
      },
      select: { id: true, sucursalId: true },
    });
    if (!zona) throw new NotFoundException('Zona no encontrada');
    return zona;
  }

  async create(data: CreateMesaDto, usuario: UsuarioAutenticado) {
    await this.validarZonaDentroDelAlcance(data.zonaId, usuario);
    return this.prisma.mesa.create({ data });
  }

  findAll(usuario: UsuarioAutenticado) {
    return this.prisma.mesa.findMany({
      where: {
        estado: true,
        zona: { estado: true, sucursal: this.filtroSucursal(usuario) },
      },
      orderBy: { numero: 'asc' },
    });
  }

  async ocuparSinPedido(
    id: number,
    _motivo: string | undefined,
    usuario: UsuarioAutenticado,
  ) {
    void _motivo;
    return this.prisma.transaccionSerializable(async (tx) => {
      const mesa = await tx.mesa.findFirst({
        where: {
          id,
          estado: true,
          zona: { sucursal: this.filtroSucursal(usuario) },
        },
      });
      if (!mesa) throw new NotFoundException('Mesa no encontrada');
      const actualizada = await tx.mesa.updateMany({
        where: { id, situacion: EstadoMesa.LIBRE },
        data: {
          situacion: EstadoMesa.OCUPADA,
          ocupacionManual: true,
          ocupadaManualEn: new Date(),
          ocupadaManualPorId: usuario.id,
        },
      });
      if (actualizada.count !== 1)
        throw new BadRequestException('La mesa no está libre');
      return tx.mesa.findUniqueOrThrow({ where: { id } });
    });
  }

  async liberarSinConsumo(
    id: number,
    _motivo: string | undefined,
    usuario: UsuarioAutenticado,
  ) {
    void _motivo;
    return this.prisma.transaccionSerializable(async (tx) => {
      const mesa = await tx.mesa.findFirst({
        where: {
          id,
          estado: true,
          zona: { sucursal: this.filtroSucursal(usuario) },
        },
      });
      if (!mesa) throw new NotFoundException('Mesa no encontrada');
      if (mesa.situacion !== EstadoMesa.OCUPADA || !mesa.ocupacionManual) {
        throw new BadRequestException(
          'Sólo puede liberarse sin consumo una ocupación manual',
        );
      }
      const pedidosActivos = await tx.pedido.count({
        where: {
          mesaId: id,
          estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ENTREGADO] },
        },
      });
      if (pedidosActivos > 0) {
        throw new BadRequestException(
          'La mesa ya tiene un pedido y debe cerrarse por el flujo de servicio',
        );
      }
      return tx.mesa.update({
        where: { id },
        data: {
          situacion: EstadoMesa.LIBRE,
          ocupacionManual: false,
          ocupadaManualEn: null,
          ocupadaManualPorId: null,
        },
      });
    });
  }
}
