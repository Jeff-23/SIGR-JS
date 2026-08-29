import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoEspera,
  EstadoMesa,
  EstadoReserva,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  CambiarEstadoEsperaDto,
  CambiarEstadoReservaDto,
  CrearEsperaDto,
  CrearReservaDto,
  SentarDto,
} from './dto/reservas.dto';

@Injectable()
export class ReservasService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(user: UsuarioAutenticado) {
    return user.rol === 'SUPERADMIN' && user.restauranteId === null;
  }

  private alcanceSucursal(user: UsuarioAutenticado): Prisma.SucursalWhereInput {
    return {
      estado: true,
      ...(!this.esSuperadmin(user)
        ? { restauranteId: user.restauranteId }
        : {}),
      ...(user.sucursalId !== null ? { id: user.sucursalId } : {}),
    };
  }

  private async mesaValida(
    tx: Prisma.TransactionClient | PrismaService,
    mesaId: number,
    sucursalId: number,
    personas: number,
    user: UsuarioAutenticado,
  ) {
    const mesa = await tx.mesa.findFirst({
      where: {
        id: mesaId,
        estado: true,
        zona: { sucursalId, sucursal: this.alcanceSucursal(user) },
      },
    });
    if (!mesa) throw new NotFoundException('Mesa no encontrada en la sede');
    if (mesa.capacidad < personas)
      throw new BadRequestException('La mesa no tiene capacidad suficiente');
    return mesa;
  }

  async crear(data: CrearReservaDto, user: UsuarioAutenticado) {
    const fechaHora = new Date(data.fechaHora);
    if (fechaHora.getTime() < Date.now() - 5 * 60_000)
      throw new BadRequestException('La reserva no puede quedar en el pasado');
    const duracion = data.duracionMinutos ?? 90;
    if (data.mesaId) {
      await this.mesaValida(
        this.prisma,
        data.mesaId,
        data.sucursalId,
        data.personas,
        user,
      );
      const candidatas = await this.prisma.reserva.findMany({
        where: {
          mesaId: data.mesaId,
          estado: { in: [EstadoReserva.PENDIENTE, EstadoReserva.CONFIRMADA] },
          fechaHora: {
            gte: new Date(fechaHora.getTime() - 8 * 60 * 60_000),
            lt: new Date(fechaHora.getTime() + duracion * 60_000),
          },
        },
      });
      const finNueva = fechaHora.getTime() + duracion * 60_000;
      const conflicto = candidatas.some((item) => {
        const inicioExistente = item.fechaHora.getTime();
        const finExistente = inicioExistente + item.duracionMinutos * 60_000;
        return inicioExistente < finNueva && finExistente > fechaHora.getTime();
      });
      if (conflicto)
        throw new BadRequestException(
          'La mesa ya tiene una reserva cercana a ese horario',
        );
    } else {
      const sede = await this.prisma.sucursal.findFirst({
        where: { id: data.sucursalId, ...this.alcanceSucursal(user) },
      });
      if (!sede) throw new NotFoundException('Sucursal no encontrada');
    }
    return this.prisma.reserva.create({
      data: {
        ...data,
        nombreCliente: data.nombreCliente.trim(),
        telefono: data.telefono.trim(),
        correo: data.correo?.trim() || null,
        fechaHora,
        duracionMinutos: duracion,
        observaciones: data.observaciones?.trim() || null,
        creadoPorId: user.id,
      },
      include: { mesa: { include: { zona: true } } },
    });
  }

  listar(user: UsuarioAutenticado, sucursalId?: number, fecha?: string) {
    const inicio = fecha
      ? new Date(`${fecha}T00:00:00-05:00`)
      : new Date(Date.now() - 12 * 60 * 60_000);
    const fin = fecha
      ? new Date(`${fecha}T23:59:59.999-05:00`)
      : new Date(Date.now() + 14 * 24 * 60 * 60_000);
    return this.prisma.reserva.findMany({
      where: {
        sucursal: this.alcanceSucursal(user),
        ...(sucursalId ? { sucursalId } : {}),
        fechaHora: { gte: inicio, lte: fin },
      },
      include: {
        mesa: { include: { zona: true } },
        creadoPor: { select: { id: true, nombres: true, apellidos: true } },
      },
      orderBy: { fechaHora: 'asc' },
    });
  }

  async cambiarEstado(
    id: number,
    data: CambiarEstadoReservaDto,
    user: UsuarioAutenticado,
  ) {
    const reserva = await this.prisma.reserva.findFirst({
      where: { id, sucursal: this.alcanceSucursal(user) },
    });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    if (
      reserva.estado === EstadoReserva.SENTADA ||
      reserva.estado === EstadoReserva.COMPLETADA
    )
      throw new BadRequestException('La reserva ya inició su servicio');
    if (data.estado === EstadoReserva.SENTADA)
      throw new BadRequestException(
        'Usa la operación sentar para asignar una mesa',
      );
    return this.prisma.reserva.update({
      where: { id },
      data: { estado: data.estado },
    });
  }

  sentarReserva(id: number, data: SentarDto, user: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const reserva = await tx.reserva.findFirst({
        where: { id, sucursal: this.alcanceSucursal(user) },
      });
      if (!reserva) throw new NotFoundException('Reserva no encontrada');
      if (
        reserva.estado !== EstadoReserva.PENDIENTE &&
        reserva.estado !== EstadoReserva.CONFIRMADA &&
        reserva.estado !== EstadoReserva.EN_ESPERA
      )
        throw new BadRequestException(
          'La reserva no puede sentarse en su estado actual',
        );
      await this.mesaValida(
        tx,
        data.mesaId,
        reserva.sucursalId,
        reserva.personas,
        user,
      );
      const ocupada = await tx.mesa.updateMany({
        where: { id: data.mesaId, situacion: EstadoMesa.LIBRE },
        data: {
          situacion: EstadoMesa.OCUPADA,
          ocupacionManual: true,
          ocupadaManualEn: new Date(),
          ocupadaManualPorId: user.id,
        },
      });
      if (ocupada.count !== 1)
        throw new BadRequestException('La mesa ya no está libre');
      return tx.reserva.update({
        where: { id },
        data: { estado: EstadoReserva.SENTADA, mesaId: data.mesaId },
        include: { mesa: { include: { zona: true } } },
      });
    });
  }

  async crearEspera(data: CrearEsperaDto, user: UsuarioAutenticado) {
    const sede = await this.prisma.sucursal.findFirst({
      where: { id: data.sucursalId, ...this.alcanceSucursal(user) },
    });
    if (!sede) throw new NotFoundException('Sucursal no encontrada');
    return this.prisma.entradaListaEspera.create({
      data: {
        ...data,
        nombreCliente: data.nombreCliente.trim(),
        telefono: data.telefono?.trim() || null,
        observaciones: data.observaciones?.trim() || null,
        creadoPorId: user.id,
      },
    });
  }

  listarEspera(user: UsuarioAutenticado, sucursalId?: number) {
    return this.prisma.entradaListaEspera.findMany({
      where: {
        sucursal: this.alcanceSucursal(user),
        ...(sucursalId ? { sucursalId } : {}),
        estado: { in: [EstadoEspera.ESPERANDO, EstadoEspera.AVISADO] },
      },
      include: { mesa: { include: { zona: true } } },
      orderBy: { llegadaEn: 'asc' },
    });
  }

  async cambiarEspera(
    id: number,
    data: CambiarEstadoEsperaDto,
    user: UsuarioAutenticado,
  ) {
    const item = await this.prisma.entradaListaEspera.findFirst({
      where: { id, sucursal: this.alcanceSucursal(user) },
    });
    if (!item) throw new NotFoundException('Entrada de espera no encontrada');
    if (data.estado === EstadoEspera.SENTADO)
      throw new BadRequestException(
        'Usa la operación sentar para asignar una mesa',
      );
    return this.prisma.entradaListaEspera.update({
      where: { id },
      data: {
        estado: data.estado,
        ...(data.estado === EstadoEspera.AVISADO
          ? { avisadoEn: new Date() }
          : {}),
      },
    });
  }

  sentarEspera(id: number, data: SentarDto, user: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const item = await tx.entradaListaEspera.findFirst({
        where: { id, sucursal: this.alcanceSucursal(user) },
      });
      if (!item) throw new NotFoundException('Entrada de espera no encontrada');
      if (
        item.estado !== EstadoEspera.ESPERANDO &&
        item.estado !== EstadoEspera.AVISADO
      )
        throw new BadRequestException('La entrada ya no está activa');
      await this.mesaValida(
        tx,
        data.mesaId,
        item.sucursalId,
        item.personas,
        user,
      );
      const ocupada = await tx.mesa.updateMany({
        where: { id: data.mesaId, situacion: EstadoMesa.LIBRE },
        data: {
          situacion: EstadoMesa.OCUPADA,
          ocupacionManual: true,
          ocupadaManualEn: new Date(),
          ocupadaManualPorId: user.id,
        },
      });
      if (ocupada.count !== 1)
        throw new BadRequestException('La mesa ya no está libre');
      return tx.entradaListaEspera.update({
        where: { id },
        data: {
          estado: EstadoEspera.SENTADO,
          mesaId: data.mesaId,
          sentadoEn: new Date(),
        },
        include: { mesa: true },
      });
    });
  }
}
