import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CanalComunicacion,
  Prisma,
  TipoMovimientoPuntos,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  AjustarPuntosDto,
  ConsentimientoDto,
  CrearCuponDto,
  CrearNivelDto,
  CrearPromocionDto,
} from './dto/fidelizacion.dto';

@Injectable()
export class FidelizacionService {
  constructor(private readonly prisma: PrismaService) {}

  private restaurante(user: UsuarioAutenticado) {
    if (user.restauranteId === null)
      throw new ForbiddenException(
        'La operación requiere contexto de restaurante',
      );
    return user.restauranteId;
  }

  async crearPromocion(data: CrearPromocionDto, user: UsuarioAutenticado) {
    const restauranteId = this.restaurante(user);
    const inicio = new Date(data.fechaInicio),
      fin = new Date(data.fechaFin);
    if (inicio >= fin)
      throw new BadRequestException('La vigencia de la promoción es inválida');
    if (data.tipo === 'PORCENTAJE' && data.valor > 100)
      throw new BadRequestException('El porcentaje no puede superar 100');
    if (data.sucursalId) {
      const branch = await this.prisma.sucursal.findFirst({
        where: { id: data.sucursalId, restauranteId, estado: true },
      });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');
    }
    const productIds = [...new Set(data.productoIds ?? [])];
    if (productIds.length) {
      const count = await this.prisma.producto.count({
        where: {
          id: { in: productIds },
          categoria: { sucursal: { restauranteId } },
        },
      });
      if (count !== productIds.length)
        throw new BadRequestException('Hay productos fuera del restaurante');
    }
    return this.prisma.promocion.create({
      data: {
        restauranteId,
        sucursalId: data.sucursalId,
        nombre: data.nombre.trim(),
        descripcion: data.descripcion?.trim() || null,
        tipo: data.tipo,
        valor: data.valor,
        compraMinima: data.compraMinima ?? 0,
        fechaInicio: inicio,
        fechaFin: fin,
        diasSemana: [...new Set(data.diasSemana)].sort(),
        horaInicio: data.horaInicio,
        horaFin: data.horaFin,
        combinable: data.combinable ?? false,
        requiereCupon: data.requiereCupon ?? false,
        productos: { create: productIds.map((productoId) => ({ productoId })) },
      },
      include: { sucursal: true, productos: { include: { producto: true } } },
    });
  }

  listarPromociones(user: UsuarioAutenticado) {
    return this.prisma.promocion.findMany({
      where: { restauranteId: this.restaurante(user) },
      include: {
        sucursal: true,
        productos: { include: { producto: true } },
        cupones: true,
      },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async crearCupon(data: CrearCuponDto, user: UsuarioAutenticado) {
    const restauranteId = this.restaurante(user);
    const promocion = await this.prisma.promocion.findFirst({
      where: { id: data.promocionId, restauranteId },
    });
    if (!promocion) throw new NotFoundException('Promoción no encontrada');
    if (data.clienteId) {
      const client = await this.prisma.cliente.findFirst({
        where: { id: data.clienteId, restauranteId, estado: true },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');
    }
    return this.prisma.cupon.create({
      data: {
        restauranteId,
        promocionId: promocion.id,
        clienteId: data.clienteId,
        codigo: data.codigo.trim().toUpperCase(),
        usosMaximos: data.usosMaximos,
        validoDesde: data.validoDesde ? new Date(data.validoDesde) : null,
        validoHasta: data.validoHasta ? new Date(data.validoHasta) : null,
      },
    });
  }

  listarCupones(user: UsuarioAutenticado) {
    return this.prisma.cupon.findMany({
      where: { restauranteId: this.restaurante(user) },
      include: { promocion: true, cliente: true },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async crearNivel(data: CrearNivelDto, user: UsuarioAutenticado) {
    return this.prisma.nivelFidelizacion.create({
      data: {
        restauranteId: this.restaurante(user),
        nombre: data.nombre.trim(),
        puntosMinimos: data.puntosMinimos,
        multiplicador: data.multiplicador,
        beneficios:
          data.beneficios === undefined
            ? Prisma.JsonNull
            : (data.beneficios as Prisma.InputJsonValue),
      },
    });
  }

  listarNiveles(user: UsuarioAutenticado) {
    return this.prisma.nivelFidelizacion.findMany({
      where: { restauranteId: this.restaurante(user), activo: true },
      orderBy: { puntosMinimos: 'asc' },
    });
  }

  async resumenCliente(clienteId: number, user: UsuarioAutenticado) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, restauranteId: this.restaurante(user) },
      include: {
        cuentaFidelizacion: {
          include: {
            nivel: true,
            movimientos: { orderBy: { creadoEn: 'desc' }, take: 100 },
          },
        },
        consentimientos: true,
        ventas: {
          include: {
            detalles: { include: { producto: true } },
            pagos: { include: { metodoPago: true } },
            aplicacionesDescuento: true,
          },
          orderBy: { fechaOperacion: 'desc' },
          take: 100,
        },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const totalCompras = cliente.ventas
      .filter((v) => v.estado === 'PAGADA')
      .reduce((sum, v) => sum + Number(v.total), 0);
    return {
      ...cliente,
      indicadores: {
        ventas: cliente.ventas.length,
        totalCompras,
        ultimaCompra: cliente.ventas[0]?.fechaOperacion ?? null,
      },
    };
  }

  async consentimiento(
    clienteId: number,
    canal: CanalComunicacion,
    data: ConsentimientoDto,
    user: UsuarioAutenticado,
  ) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, restauranteId: this.restaurante(user) },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.consentimientoCliente.upsert({
      where: { clienteId_canal: { clienteId, canal } },
      create: {
        clienteId,
        canal,
        otorgado: data.otorgado,
        fuente: data.fuente.trim(),
        usuarioId: user.id,
        revocadoEn: data.otorgado ? null : new Date(),
      },
      update: {
        otorgado: data.otorgado,
        fuente: data.fuente.trim(),
        usuarioId: user.id,
        registradoEn: new Date(),
        revocadoEn: data.otorgado ? null : new Date(),
      },
    });
  }

  ajustar(clienteId: number, data: AjustarPuntosDto, user: UsuarioAutenticado) {
    if (data.puntos === 0)
      throw new BadRequestException('El ajuste no puede ser cero');
    return this.prisma.transaccionSerializable(async (tx) => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, restauranteId: this.restaurante(user) },
      });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
      const cuenta = await tx.cuentaFidelizacion.upsert({
        where: { clienteId },
        create: { clienteId },
        update: {},
      });
      const saldo = cuenta.saldoPuntos + data.puntos;
      if (saldo < 0)
        throw new BadRequestException('El ajuste dejaría saldo negativo');
      await tx.cuentaFidelizacion.update({
        where: { id: cuenta.id },
        data: {
          saldoPuntos: saldo,
          ...(data.puntos > 0
            ? { puntosHistoricos: { increment: data.puntos } }
            : {}),
        },
      });
      return tx.movimientoPuntos.create({
        data: {
          cuentaId: cuenta.id,
          usuarioId: user.id,
          tipo: TipoMovimientoPuntos.AJUSTE,
          puntos: data.puntos,
          saldoPosterior: saldo,
          motivo: data.motivo.trim(),
        },
      });
    });
  }
}
