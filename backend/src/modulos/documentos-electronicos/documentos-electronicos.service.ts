import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class DocumentosElectronicosService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual:
      UsuarioAutenticado,
  ) {
    return (
      usuarioActual.rol ===
        'SUPERADMIN' &&
      usuarioActual.restauranteId ===
        null
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
              id: usuarioActual.restauranteId!,
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
    const sucursal =
      this.filtroSucursal(usuarioActual);

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
  async preparar(
    facturaIds: number[],
    usuarioActual: UsuarioAutenticado,
  ) {
    const idsUnicos = [
      ...new Set(facturaIds),
    ];

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const facturas =
            await tx.factura.findMany({
              where: {
                id: {
                  in: idsUnicos,
                },

                estado: 'EMITIDA',

                AND: [
                  this.filtroFacturaTenant(
                    usuarioActual,
                  ),
                ],
              },

              include: {
                documentoElectronico:
                  true,

                venta: {
                  select: {
                    id: true,
                    origen: true,
                    fechaOperacion: true,
                    sucursalId: true,
                  },
                },

                pedido: {
                  select: {
                    id: true,
                    sucursalId: true,
                  },
                },
              },
            });

          /*
           * Mantenemos respuesta genérica para
           * no revelar facturas de otro tenant.
           */
          if (
            facturas.length !==
            idsUnicos.length
          ) {
            throw new NotFoundException(
              'Una o más facturas no existen o no están disponibles',
            );
          }

          const yaPreparadas =
            facturas.filter(
              (factura) =>
                factura.documentoElectronico !==
                null,
            );

          if (
            yaPreparadas.length > 0
          ) {
            throw new BadRequestException(
              'Una o más facturas ya tienen documento electrónico asociado',
            );
          }

          /*
           * No enviamos nada.
           *
           * El estado PREPARADO se asigna
           * automáticamente por Prisma.
           */
          await tx.documentoElectronico.createMany({
            data: facturas.map(
              (factura) => ({
                facturaId:
                  factura.id,
              }),
            ),
          });

          return tx.documentoElectronico.findMany({
            where: {
              facturaId: {
                in: idsUnicos,
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
              id: 'asc',
            },
          });
        },
      );
    }
    catch (error) {
      /*
       * Protección adicional ante dos solicitudes
       * concurrentes intentando preparar la misma factura.
       */
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Una o más facturas ya tienen documento electrónico asociado',
        );
      }

      throw error;
    }
  }

  async findAll(
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.documentoElectronico.findMany({
      where: {
        factura: {
          is: this.filtroFacturaTenant(
            usuarioActual,
          ),
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

  async findOne(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const documento =
      await this.prisma.documentoElectronico.findFirst({
        where: {
          id,

          factura: {
            is: this.filtroFacturaTenant(
              usuarioActual,
            ),
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
      throw new NotFoundException(
        'Documento electrónico no encontrado',
      );
    }

    return documento;
  }
}
