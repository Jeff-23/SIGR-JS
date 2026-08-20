import { Injectable } from '@nestjs/common';
import { EstadoCaja, EstadoMesa, EstadoPedido, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { FiltroReportesDto } from '../reportes/dto/filtro-reportes.dto';
import { ReportesService } from '../reportes/reportes.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportesService: ReportesService,
  ) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private filtroSucursal(
    usuarioActual: UsuarioAutenticado,
    sucursalId?: number,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      ...(sucursalId !== undefined ? { id: sucursalId } : {}),

      ...(!this.esSuperadmin(usuarioActual)
        ? {
            restauranteId: usuarioActual.restauranteId,
          }
        : {}),

      ...(usuarioActual.sucursalId !== null
        ? {
            id: usuarioActual.sucursalId,
          }
        : {}),
    };
  }

  private filtroRestauranteClientes(
    usuarioActual: UsuarioAutenticado,
  ): Prisma.RestauranteWhereInput {
    if (this.esSuperadmin(usuarioActual)) {
      return {
        estado: true,
      };
    }

    return {
      id: usuarioActual.restauranteId,
      estado: true,
    };
  }

  async resumen(filtros: FiltroReportesDto, usuarioActual: UsuarioAutenticado) {
    const { inicio, fin } = this.reportesService.resolverRango(filtros);

    const sucursal = this.filtroSucursal(usuarioActual, filtros.sucursalId);

    const [
      ventas,
      topProductos,
      sinStock,
      cantidadPedidos,
      cajasAbiertas,
      mesasOcupadas,
      mesasPendientesPago,
      clientesNuevos,
    ] = await Promise.all([
      this.reportesService.resumen(filtros, usuarioActual),

      this.reportesService.productosMasVendidos(
        {
          ...filtros,
          limite: 5,
        },
        usuarioActual,
      ),

      this.reportesService.inventarioSinStock(filtros, usuarioActual),

      this.prisma.pedido.count({
        where: {
          creadoEn: {
            gte: inicio,
            lte: fin,
          },
          estado: {
            not: EstadoPedido.CANCELADO,
          },
          sucursal,
        },
      }),

      this.prisma.caja.count({
        where: {
          estado: EstadoCaja.ABIERTA,
          sucursal,
        },
      }),

      this.prisma.mesa.count({
        where: {
          estado: true,
          situacion: EstadoMesa.OCUPADA,
          zona: {
            sucursal,
          },
        },
      }),

      this.prisma.mesa.count({
        where: {
          estado: true,
          situacion: EstadoMesa.PENDIENTE_PAGO,
          zona: {
            sucursal,
          },
        },
      }),

      this.prisma.cliente.count({
        where: {
          estado: true,
          creadoEn: {
            gte: inicio,
            lte: fin,
          },
          restaurante: this.filtroRestauranteClientes(usuarioActual),
        },
      }),
    ]);

    return {
      periodo: ventas.periodo,
      ventas: {
        cantidad: ventas.cantidadVentas,
        total: ventas.totalVentas,
        totalPagado: ventas.totalPagado,
        porEstado: ventas.porEstado,
      },
      pedidos: {
        cantidad: cantidadPedidos,
      },
      operacionActual: {
        cajasAbiertas,
        mesasOcupadas,
        mesasPendientesPago,
      },
      clientes: {
        nuevosRestaurante: clientesNuevos,
        nota: 'Los clientes pertenecen al restaurante, no a una sucursal específica.',
      },
      productosMasVendidos: topProductos.datos,
      inventario: {
        sinStock: sinStock.total,
        criterio: sinStock.criterio,
      },
      utilidad: null,
      notaUtilidad:
        'No se calcula utilidad hasta contar con un modelo de costos contables suficiente.',
    };
  }
}
