import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoMesa, Prisma, TipoPedido } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { claveFechaEnZona } from '../../plataforma/zona-horaria';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { imagenProductoDb } from '../productos/imagenes-producto.prisma';
import { CrearSolicitudQrDto } from './dto/menu-qr.dto';

@Injectable()
export class MenuQrService {
  constructor(private readonly prisma: PrismaService) {}

  async generarAcceso(mesaId: number, usuario: UsuarioAutenticado) {
    await this.mesaEnAlcance(mesaId, usuario);
    return this.prisma.accesoMesaQr.upsert({
      where: { mesaId },
      update: { token: randomUUID().replaceAll('-', ''), activo: true },
      create: { mesaId, token: randomUUID().replaceAll('-', '') },
      include: { mesa: { select: { numero: true } } },
    });
  }

  async menu(token: string) {
    const acceso = await this.accesoPublico(token);
    const sucursalId = acceso.mesa.zona.sucursal.id;
    const restauranteId = acceso.mesa.zona.sucursal.restauranteId;
    const modoQr = await this.modoQr(sucursalId, restauranteId);
    const ids = acceso.mesa.zona.sucursal.categorias.flatMap((categoria) =>
      categoria.productos.map((producto) => producto.id),
    );
    const imagenes = ids.length
      ? await imagenProductoDb(this.prisma).findMany({
          where: { productoId: { in: ids }, estado: 'ACTIVA' },
        })
      : [];
    const porProducto = new Map(
      imagenes.map((imagen) => [imagen.productoId, imagen]),
    );
    const zonaConfig = await this.prisma.configuracionSucursal.findUnique({
      where: {
        sucursalId_clave: { sucursalId, clave: 'ZONA_HORARIA' },
      },
      select: { valor: true },
    });
    const zonaHoraria =
      typeof zonaConfig?.valor === 'string'
        ? zonaConfig.valor
        : 'America/Bogota';
    const ahora = new Date();
    const fechaCarta = claveFechaEnZona(ahora, zonaHoraria);
    const identidadConfig =
      await this.prisma.configuracionRestaurante.findUnique({
        where: {
          restauranteId_clave: {
            restauranteId,
            clave: 'CARTA_IDENTIDAD',
          },
        },
        select: { valor: true },
      });
    const identidadCarta =
      identidadConfig?.valor &&
      typeof identidadConfig.valor === 'object' &&
      !Array.isArray(identidadConfig.valor)
        ? identidadConfig.valor
        : null;
    const perfiles = await this.prisma.perfilCarta.findMany({
      where: { sucursalId, estado: true },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
    let activos = perfiles.filter((perfil) =>
      this.perfilActivo(perfil, ahora, zonaHoraria),
    );
    if (!activos.length) {
      const respaldo =
        perfiles.find((perfil) => perfil.predeterminada) ?? perfiles[0];
      activos = respaldo ? [respaldo] : [];
    }
    const perfilIds = activos.map((perfil) => perfil.id);
    const cartas = perfilIds.length
      ? await this.prisma.cartaDia.findMany({
          where: {
            perfilCartaId: { in: perfilIds },
            fecha: new Date(`${fechaCarta}T00:00:00.000Z`),
            publicada: true,
          },
        })
      : [];
    const cartaPorPerfil = new Map(
      cartas.map((carta) => [carta.perfilCartaId, carta]),
    );
    const perfilesCarta = activos.map((perfil) => {
      const carta = cartaPorPerfil.get(perfil.id);
      return {
        id: perfil.id,
        nombre: perfil.nombre,
        descripcion: perfil.descripcion,
        plantilla: perfil.plantilla,
        cartaDia: carta
          ? { fecha: fechaCarta, contenido: carta.contenido }
          : null,
      };
    });
    const principal = perfilesCarta[0] ?? null;
    return {
      restaurante: acceso.mesa.zona.sucursal.restaurante.nombre,
      sucursal: acceso.mesa.zona.sucursal.nombre,
      mesa: { id: acceso.mesa.id, numero: acceso.mesa.numero },
      modoQr,
      pedidosHabilitados: modoQr !== 'SOLO_MENU',
      requiereAceptacion: modoQr === 'PEDIDO_CON_APROBACION',
      perfilCartaId: principal?.id ?? null,
      perfilesCarta,
      identidadCarta,
      // Compatibilidad con clientes S56 anteriores.
      plantillaCarta: principal?.plantilla ?? null,
      cartaDia: principal?.cartaDia ?? null,
      categorias: acceso.mesa.zona.sucursal.categorias.map((categoria) => ({
        id: categoria.id,
        nombre: categoria.nombre,
        productos: categoria.productos.map((producto) => ({
          ...producto,
          imagenPrincipal: porProducto.get(producto.id) ?? null,
        })),
      })),
    };
  }

  async crear(token: string, dto: CrearSolicitudQrDto) {
    const acceso = await this.accesoPublico(token);
    const sucursalId = acceso.mesa.zona.sucursal.id;
    const modoQr = await this.modoQr(
      sucursalId,
      acceso.mesa.zona.sucursal.restauranteId,
    );
    if (modoQr === 'SOLO_MENU') {
      throw new ForbiddenException(
        'Los pedidos desde el menú QR están deshabilitados. Solicita atención al mesero.',
      );
    }
    const existente = await this.prisma.solicitudPedidoQr.findUnique({
      where: {
        sucursalId_claveCliente: { sucursalId, claveCliente: dto.claveCliente },
      },
      include: { detalles: true },
    });
    if (existente) return existente;
    const cantidades = new Map<
      number,
      { cantidad: number; observaciones?: string }
    >();
    for (const linea of dto.detalles) {
      const actual = cantidades.get(linea.productoId);
      cantidades.set(linea.productoId, {
        cantidad: (actual?.cantidad ?? 0) + linea.cantidad,
        observaciones: linea.observaciones?.trim() || actual?.observaciones,
      });
    }
    const productos = await this.prisma.producto.findMany({
      where: {
        id: { in: [...cantidades.keys()] },
        estado: true,
        categoria: { estado: true, sucursalId },
      },
    });
    if (productos.length !== cantidades.size)
      throw new BadRequestException(
        'El carrito contiene productos no disponibles',
      );
    let total = new Prisma.Decimal(0);
    const detalles = productos.map((producto) => {
      const linea = cantidades.get(producto.id);
      if (!linea) throw new BadRequestException('Producto no solicitado');
      const subtotal = producto.precio.mul(linea.cantidad);
      total = total.plus(subtotal);
      return {
        productoId: producto.id,
        cantidad: linea.cantidad,
        precioUnitario: producto.precio,
        subtotal,
        observaciones: linea.observaciones,
      };
    });
    const solicitud = await this.prisma.solicitudPedidoQr.create({
      data: {
        claveCliente: dto.claveCliente,
        nombreCliente: dto.nombreCliente?.trim() || null,
        observaciones: dto.observaciones?.trim() || null,
        total,
        sucursalId,
        mesaId: acceso.mesa.id,
        detalles: { create: detalles },
      },
      include: { detalles: true },
    });
    if (modoQr === 'PEDIDO_AUTOMATICO') {
      return this.aceptarAutomaticamente(solicitud.id);
    }
    return solicitud;
  }

  async estado(id: string) {
    const solicitud = await this.prisma.solicitudPedidoQr.findUnique({
      where: { id },
      select: {
        id: true,
        estado: true,
        total: true,
        creadoEn: true,
        actualizadoEn: true,
        motivoRechazo: true,
        pedidoId: true,
      },
    });
    if (!solicitud) throw new NotFoundException('Solicitud QR no encontrada');
    return solicitud;
  }

  async listar(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    return this.prisma.solicitudPedidoQr.findMany({
      where: { sucursalId },
      include: {
        mesa: { select: { numero: true } },
        detalles: { include: { producto: { select: { nombre: true } } } },
      },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
  }

  async aceptar(id: string, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPedidoQr.findUnique({
        where: { id },
        include: { detalles: true, sucursal: true },
      });
      if (!solicitud) throw new NotFoundException('Solicitud QR no encontrada');
      this.validarAlcance(
        solicitud.sucursal.restauranteId,
        solicitud.sucursalId,
        usuario,
      );
      if (solicitud.estado !== 'PENDIENTE')
        throw new BadRequestException('La solicitud QR ya fue resuelta');
      const pedido = await tx.pedido.create({
        data: {
          total: solicitud.total,
          tipo: TipoPedido.MESA,
          sucursalId: solicitud.sucursalId,
          mesaId: solicitud.mesaId,
          usuarioId: usuario.id,
          detalles: {
            create: solicitud.detalles.map((d) => ({
              productoId: d.productoId,
              cantidad: d.cantidad,
              precioUnitario: d.precioUnitario,
              subtotal: d.subtotal,
              observaciones: d.observaciones,
            })),
          },
        },
      });
      await tx.mesa.update({
        where: { id: solicitud.mesaId },
        data: { situacion: EstadoMesa.OCUPADA },
      });
      return tx.solicitudPedidoQr.update({
        where: { id },
        data: {
          estado: 'ACEPTADA',
          pedidoId: pedido.id,
          aceptadoPorId: usuario.id,
          resueltoEn: new Date(),
        },
        include: { pedido: true, detalles: true },
      });
    });
  }

  async rechazar(id: string, motivo: string, usuario: UsuarioAutenticado) {
    const solicitud = await this.prisma.solicitudPedidoQr.findUnique({
      where: { id },
      include: { sucursal: true },
    });
    if (!solicitud) throw new NotFoundException('Solicitud QR no encontrada');
    this.validarAlcance(
      solicitud.sucursal.restauranteId,
      solicitud.sucursalId,
      usuario,
    );
    if (solicitud.estado !== 'PENDIENTE')
      throw new BadRequestException('La solicitud QR ya fue resuelta');
    return this.prisma.solicitudPedidoQr.update({
      where: { id },
      data: {
        estado: 'RECHAZADA',
        motivoRechazo: motivo.trim(),
        resueltoEn: new Date(),
      },
    });
  }

  private accesoPublico(token: string) {
    return this.prisma.accesoMesaQr
      .findFirstOrThrow({
        where: {
          token,
          activo: true,
          mesa: {
            estado: true,
            zona: {
              estado: true,
              sucursal: { estado: true, restaurante: { estado: true } },
            },
          },
        },
        include: {
          mesa: {
            include: {
              zona: {
                include: {
                  sucursal: {
                    include: {
                      restaurante: true,
                      categorias: {
                        where: { estado: true },
                        include: {
                          productos: {
                            where: { estado: true },
                            select: {
                              id: true,
                              nombre: true,
                              descripcion: true,
                              precio: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
      .catch(() => {
        throw new NotFoundException('Menú QR no disponible');
      });
  }

  async modoSucursal(sucursalId: number, usuario: UsuarioAutenticado) {
    const sucursal = await this.sucursalEnAlcance(sucursalId, usuario);
    return {
      modoQr: await this.modoQr(sucursalId, sucursal.restauranteId),
    };
  }

  private perfilActivo(
    perfil: {
      modoActivacion: string;
      activoManual: boolean;
      horaInicio: string | null;
      horaFin: string | null;
      diasSemana: Prisma.JsonValue;
    },
    ahora: Date,
    zonaHoraria: string,
  ) {
    if (perfil.modoActivacion === 'SIEMPRE') return true;
    if (perfil.modoActivacion === 'MANUAL') return perfil.activoManual;
    if (perfil.modoActivacion !== 'HORARIO') return false;
    if (!perfil.horaInicio || !perfil.horaFin) return false;
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(ahora);
    const valor = (tipo: string) =>
      partes.find((parte) => parte.type === tipo)?.value ?? '';
    const dias: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    const dia = dias[valor('weekday')] ?? 1;
    const hora = `${valor('hour')}:${valor('minute')}`;
    const configurados = Array.isArray(perfil.diasSemana)
      ? perfil.diasSemana.filter(
          (item): item is number => typeof item === 'number',
        )
      : [1, 2, 3, 4, 5, 6, 7];
    if (perfil.horaInicio <= perfil.horaFin) {
      return (
        configurados.includes(dia) &&
        hora >= perfil.horaInicio &&
        hora < perfil.horaFin
      );
    }
    if (hora >= perfil.horaInicio) return configurados.includes(dia);
    const diaAnterior = dia === 1 ? 7 : dia - 1;
    return hora < perfil.horaFin && configurados.includes(diaAnterior);
  }

  private async modoQr(
    sucursalId: number,
    restauranteId: number,
  ): Promise<'SOLO_MENU' | 'PEDIDO_CON_APROBACION' | 'PEDIDO_AUTOMATICO'> {
    const [modoSucursal, modoRestaurante] = await Promise.all([
      this.prisma.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: {
            sucursalId,
            clave: 'QR_MODO',
          },
        },
      }),
      this.prisma.configuracionRestaurante.findUnique({
        where: {
          restauranteId_clave: {
            restauranteId,
            clave: 'QR_MODO',
          },
        },
      }),
    ]);

    const modo = modoSucursal?.valor ?? modoRestaurante?.valor;
    if (
      modo === 'SOLO_MENU' ||
      modo === 'PEDIDO_CON_APROBACION' ||
      modo === 'PEDIDO_AUTOMATICO'
    ) {
      return modo;
    }

    // Compatibilidad con configuración anterior. S55 crea QR_MODO=SOLO_MENU
    // para sucursales existentes, pero este fallback permite leer snapshots
    // o bases anteriores sin romper el flujo.
    const [sucursalAnterior, restauranteAnterior] = await Promise.all([
      this.prisma.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: {
            sucursalId,
            clave: 'QR_REQUIERE_ACEPTACION',
          },
        },
      }),
      this.prisma.configuracionRestaurante.findUnique({
        where: {
          restauranteId_clave: {
            restauranteId,
            clave: 'QR_REQUIERE_ACEPTACION',
          },
        },
      }),
    ]);
    const requiere =
      sucursalAnterior?.valor ?? restauranteAnterior?.valor ?? true;
    return requiere === false ? 'PEDIDO_AUTOMATICO' : 'PEDIDO_CON_APROBACION';
  }

  private aceptarAutomaticamente(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPedidoQr.findUniqueOrThrow({
        where: { id },
        include: { detalles: true },
      });
      const pedido = await tx.pedido.create({
        data: {
          total: solicitud.total,
          tipo: TipoPedido.MESA,
          sucursalId: solicitud.sucursalId,
          mesaId: solicitud.mesaId,
          usuarioId: null,
          detalles: {
            create: solicitud.detalles.map((detalle) => ({
              productoId: detalle.productoId,
              cantidad: detalle.cantidad,
              precioUnitario: detalle.precioUnitario,
              subtotal: detalle.subtotal,
              observaciones: detalle.observaciones,
            })),
          },
        },
      });
      await tx.mesa.update({
        where: { id: solicitud.mesaId },
        data: { situacion: EstadoMesa.OCUPADA },
      });
      return tx.solicitudPedidoQr.update({
        where: { id },
        data: {
          estado: 'ACEPTADA',
          pedidoId: pedido.id,
          resueltoEn: new Date(),
        },
        include: { detalles: true },
      });
    });
  }

  private async mesaEnAlcance(id: number, usuario: UsuarioAutenticado) {
    const mesa = await this.prisma.mesa.findUnique({
      where: { id },
      include: { zona: { include: { sucursal: true } } },
    });
    if (!mesa) throw new NotFoundException('Mesa no encontrada');
    this.validarAlcance(
      mesa.zona.sucursal.restauranteId,
      mesa.zona.sucursalId,
      usuario,
    );
    return mesa;
  }

  private async sucursalEnAlcance(id: number, usuario: UsuarioAutenticado) {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { id } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    this.validarAlcance(sucursal.restauranteId, id, usuario);
    return sucursal;
  }

  private validarAlcance(
    restauranteId: number,
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    if (
      usuario.restauranteId !== null &&
      usuario.restauranteId !== restauranteId
    )
      throw new ForbiddenException('Recurso fuera del restaurante');
    if (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId)
      throw new ForbiddenException('Recurso fuera de la sucursal');
  }
}
