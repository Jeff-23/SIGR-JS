import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoMesa, EstadoPedido, EstadoReserva, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CreateMesaDto } from './dto/create-mesa.dto';
import { ActualizarMesaDto } from './dto/actualizar-mesa.dto';

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

  private normalizarNumero(numero: string) {
    return numero.trim();
  }

  private async validarNumeroDisponible(
    zonaId: number,
    numero: string,
    excluirId?: number,
  ) {
    const existente = await this.prisma.mesa.findFirst({
      where: {
        zonaId,
        numero: { equals: numero, mode: 'insensitive' },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
      select: { id: true },
    });
    if (existente) {
      throw new BadRequestException(
        `Ya existe una mesa ${numero} en esta zona`,
      );
    }
  }

  async create(data: CreateMesaDto, usuario: UsuarioAutenticado) {
    await this.validarZonaDentroDelAlcance(data.zonaId, usuario);
    const numero = this.normalizarNumero(data.numero);
    await this.validarNumeroDisponible(data.zonaId, numero);
    return this.prisma.mesa.create({ data: { ...data, numero } });
  }

  async findAll(
    usuario: UsuarioAutenticado,
    sucursalId?: number,
    incluirInactivas = false,
  ) {
    const mesas = await this.prisma.mesa.findMany({
      where: {
        ...(incluirInactivas ? {} : { estado: true }),
        zona: {
          estado: true,
          sucursal: {
            AND: [
              this.filtroSucursal(usuario),
              ...(sucursalId ? [{ id: sucursalId }] : []),
            ],
          },
        },
      },
      include: { zona: true },
    });
    const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    return mesas.sort((a, b) => {
      const zona = collator.compare(a.zona.nombre, b.zona.nombre);
      return zona || collator.compare(a.numero, b.numero);
    });
  }

  async actualizar(
    id: number,
    data: ActualizarMesaDto,
    usuario: UsuarioAutenticado,
  ) {
    const actual = await this.prisma.mesa.findFirst({
      where: { id, zona: { sucursal: this.filtroSucursal(usuario) } },
      include: { zona: true },
    });
    if (!actual) throw new NotFoundException('Mesa no encontrada');

    const zonaId = data.zonaId ?? actual.zonaId;
    if (data.zonaId) await this.validarZonaDentroDelAlcance(data.zonaId, usuario);
    const numero = this.normalizarNumero(data.numero ?? actual.numero);
    await this.validarNumeroDisponible(zonaId, numero, id);

    return this.prisma.mesa.update({
      where: { id },
      data: {
        ...(data.numero !== undefined ? { numero } : {}),
        ...(data.capacidad !== undefined ? { capacidad: data.capacidad } : {}),
        ...(data.zonaId !== undefined ? { zonaId: data.zonaId } : {}),
        ...(data.forma !== undefined ? { forma: data.forma } : {}),
        ...(data.orientacion !== undefined ? { orientacion: data.orientacion } : {}),
        ...(data.tamanoVisual !== undefined ? { tamanoVisual: data.tamanoVisual } : {}),
      },
      include: { zona: true },
    });
  }

  async cambiarEstado(
    id: number,
    activo: boolean,
    usuario: UsuarioAutenticado,
  ) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id, zona: { sucursal: this.filtroSucursal(usuario) } },
      select: { id: true, estado: true, situacion: true },
    });
    if (!mesa) throw new NotFoundException('Mesa no encontrada');
    if (mesa.estado === activo) return this.prisma.mesa.findUnique({ where: { id }, include: { zona: true } });

    if (!activo) {
      if (mesa.situacion !== EstadoMesa.LIBRE) {
        throw new BadRequestException('Sólo puede desactivarse una mesa libre');
      }
      const [pedidosActivos, reservasActivas] = await Promise.all([
        this.prisma.pedido.count({
          where: {
            mesaId: id,
            estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ENTREGADO, EstadoPedido.FACTURADO] },
          },
        }),
        this.prisma.reserva.count({
          where: {
            mesaId: id,
            estado: { in: [EstadoReserva.PENDIENTE, EstadoReserva.CONFIRMADA] },
            fechaHora: { gte: new Date() },
          },
        }),
      ]);
      if (pedidosActivos > 0 || reservasActivas > 0) {
        throw new BadRequestException(
          'La mesa tiene pedidos o reservas activas y no puede desactivarse',
        );
      }
    }

    return this.prisma.mesa.update({
      where: { id },
      data: { estado: activo },
      include: { zona: true },
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
