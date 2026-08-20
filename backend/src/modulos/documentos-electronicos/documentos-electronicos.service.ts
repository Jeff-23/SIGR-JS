import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { createHash } from 'crypto';
import { UblFiscalService } from './ubl-fiscal.service';

@Injectable()
export class DocumentosElectronicosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ubl: UblFiscalService,
  ) {}

  async numerar(
    id: number,
    resolucionId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const documento = await this.prisma.documentoElectronico.findFirst({
      where: { id, factura: { is: this.filtroFacturaTenant(usuarioActual) } },
      include: {
        factura: {
          include: {
            venta: {
              include: {
                sucursal: {
                  include: { restaurante: { include: { perfilFiscal: true } } },
                },
                cliente: true,
                detalles: { include: { producto: true } },
              },
            },
          },
        },
      },
    });
    const venta = documento?.factura.venta;
    if (!documento || !venta)
      throw new NotFoundException('Documento electrónico no encontrado');
    if (documento.estado !== 'PREPARADO')
      throw new BadRequestException(
        'Sólo un documento PREPARADO puede numerarse',
      );
    const perfil = venta.sucursal.restaurante.perfilFiscal;
    if (!perfil?.activo)
      throw new BadRequestException(
        'El restaurante no tiene un perfil fiscal activo',
      );

    const asignacion = await this.prisma.transaccionSerializable(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "ResolucionNumeracionDian" WHERE "id" = ${resolucionId} FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "DocumentoElectronico" WHERE "id" = ${id} FOR UPDATE`,
      );
      const documentoBloqueado = await tx.documentoElectronico.findUnique({
        where: { id },
        select: { estado: true, resolucionId: true },
      });
      if (
        documentoBloqueado?.estado !== 'PREPARADO' ||
        documentoBloqueado.resolucionId !== null
      ) {
        throw new BadRequestException(
          'El documento ya fue numerado por otra solicitud',
        );
      }
      const resolucion = await tx.resolucionNumeracionDian.findFirst({
        where: {
          id: resolucionId,
          restauranteId: venta.sucursal.restauranteId,
          activa: true,
          OR: [{ sucursalId: null }, { sucursalId: venta.sucursalId }],
        },
      });
      if (!resolucion)
        throw new NotFoundException('Resolución de numeración no encontrada');
      const hoy = new Date();
      hoy.setUTCHours(0, 0, 0, 0);
      if (hoy < resolucion.vigenteDesde || hoy > resolucion.vigenteHasta)
        throw new BadRequestException('La resolución no está vigente');
      if (resolucion.siguienteNumero > resolucion.rangoHasta)
        throw new BadRequestException(
          'La resolución agotó su rango autorizado',
        );
      const numeroFiscal = resolucion.siguienteNumero;
      const numeroCompleto = `${resolucion.prefijo}${numeroFiscal}`;
      const cliente = venta.cliente;
      const fechaEmision = new Date();
      const xml = this.ubl.generarBorradorFactura({
        numero: numeroCompleto,
        fecha: fechaEmision,
        proveedor: {
          nit: venta.sucursal.restaurante.nit,
          nombre: venta.sucursal.restaurante.nombre,
        },
        adquirente: {
          documento: cliente?.numeroDocumento ?? '222222222222',
          nombre: cliente
            ? `${cliente.nombres} ${cliente.apellidos ?? ''}`.trim()
            : 'Consumidor final',
        },
        subtotal: venta.subtotal,
        impuestos: venta.impuestos.add(venta.impoconsumo),
        total: venta.total,
        detalles: venta.detalles.map((d) => ({
          codigo: d.productoId,
          nombre: d.producto.nombre,
          cantidad: d.cantidad,
          precio: d.precioUnitario,
          subtotal: d.subtotal,
        })),
      });
      const xmlHash = createHash('sha256').update(xml).digest('hex');
      await tx.resolucionNumeracionDian.update({
        where: { id: resolucion.id },
        data: { siguienteNumero: { increment: 1 } },
      });
      await tx.documentoElectronico.update({
        where: { id },
        data: {
          estado: 'NUMERADO',
          ambiente: perfil.ambiente,
          prefijo: resolucion.prefijo,
          numeroFiscal,
          numeroCompleto,
          resolucionId: resolucion.id,
          xmlHash,
          proveedorCodigo: perfil.proveedorCodigo,
          solicitudProveedor: {
            formato: 'UBL-2.1-DIAN-1.9',
            firmado: false,
            xml,
          },
          historial: {
            create: {
              estado: 'NUMERADO',
              actorId: usuarioActual.id,
              detalle:
                'Numeración fiscal asignada; pendiente de firma y transmisión',
            },
          },
        },
      });
      return { numeroCompleto, xmlHash };
    });
    return {
      id,
      estado: 'NUMERADO' as const,
      ...asignacion,
      firmado: false,
      transmitido: false,
    };
  }

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private filtroSucursal(
    usuarioActual: UsuarioAutenticado,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      restaurante: {
        estado: true,

        ...(!this.esSuperadmin(usuarioActual)
          ? {
              id: usuarioActual.restauranteId,
            }
          : {}),
      },

      ...(usuarioActual.sucursalId !== null
        ? {
            id: usuarioActual.sucursalId,
          }
        : {}),
    };
  }

  /*
   * Permite trabajar tanto con:
   *
   * Factura legacy:
   * Pedido -> Factura
   *
   * Nuevo núcleo:
   * Venta -> Factura
   */
  private filtroFacturaTenant(
    usuarioActual: UsuarioAutenticado,
  ): Prisma.FacturaWhereInput {
    const sucursal = this.filtroSucursal(usuarioActual);

    return {
      OR: [
        {
          venta: {
            is: {
              sucursal,
            },
          },
        },

        {
          pedido: {
            is: {
              sucursal,
            },
          },
        },
      ],
    };
  }

  /*
   * =====================================================
   * PREPARAR DOCUMENTOS
   *
   * Esto NO envía nada a la DIAN.
   *
   * Únicamente transforma una selección explícita
   * de facturas internas en documentos PREPARADOS.
   * =====================================================
   */
  async preparar(facturaIds: number[], usuarioActual: UsuarioAutenticado) {
    const idsUnicos = [...new Set(facturaIds)];

    await this.prisma.transaccionSerializable(async (tx) => {
      const facturas = await tx.factura.findMany({
        where: {
          id: {
            in: idsUnicos,
          },

          estado: 'EMITIDA',

          AND: [this.filtroFacturaTenant(usuarioActual)],
        },

        select: {
          id: true,
          documentoElectronico: { select: { id: true } },
        },
      });

      /*
       * Mantenemos respuesta genérica para
       * no revelar facturas de otro tenant.
       */
      if (facturas.length !== idsUnicos.length) {
        throw new NotFoundException(
          'Una o más facturas no existen o no están disponibles',
        );
      }

      /*
       * No enviamos nada.
       *
       * El estado PREPARADO se asigna
       * automáticamente por Prisma.
       */
      await tx.documentoElectronico.createMany({
        data: facturas
          .filter((factura) => factura.documentoElectronico === null)
          .map((factura) => ({ facturaId: factura.id })),
        skipDuplicates: true,
      });
    });

    return this.prisma.documentoElectronico.findMany({
      where: { facturaId: { in: idsUnicos } },
      include: {
        factura: { include: { venta: true, pedido: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findAll(usuarioActual: UsuarioAutenticado) {
    return this.prisma.documentoElectronico.findMany({
      where: {
        factura: {
          is: this.filtroFacturaTenant(usuarioActual),
        },
      },

      include: {
        factura: {
          include: {
            venta: true,
            pedido: true,
          },
        },
      },

      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async findOne(id: number, usuarioActual: UsuarioAutenticado) {
    const documento = await this.prisma.documentoElectronico.findFirst({
      where: {
        id,

        factura: {
          is: this.filtroFacturaTenant(usuarioActual),
        },
      },

      include: {
        factura: {
          include: {
            venta: {
              include: {
                detalles: {
                  include: {
                    producto: true,
                  },
                },

                pagos: {
                  include: {
                    metodoPago: true,
                  },
                },
              },
            },

            pedido: {
              include: {
                detalles: {
                  include: {
                    producto: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!documento) {
      throw new NotFoundException('Documento electrónico no encontrado');
    }

    return documento;
  }
}
