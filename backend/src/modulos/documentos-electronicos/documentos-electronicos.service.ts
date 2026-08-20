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
import { ProveedorFiscalRegistry } from '../fiscal/proveedores/proveedor-fiscal.registry';

@Injectable()
export class DocumentosElectronicosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ubl: UblFiscalService,
    private readonly proveedores: ProveedorFiscalRegistry,
  ) {}

  async encolar(id: number, usuarioActual: UsuarioAutenticado) {
    const documento = await this.prisma.documentoElectronico.findFirst({
      where: { id, factura: { is: this.filtroFacturaTenant(usuarioActual) } },
      include: {
        outbox: true,
        factura: {
          include: {
            venta: {
              include: {
                sucursal: {
                  include: { restaurante: { include: { perfilFiscal: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!documento)
      throw new NotFoundException('Documento electrónico no encontrado');
    if (documento.outbox) return documento.outbox;
    if (documento.estado !== 'NUMERADO') {
      throw new BadRequestException(
        'Sólo un documento NUMERADO puede encolarse',
      );
    }
    const perfil = documento.factura.venta?.sucursal.restaurante.perfilFiscal;
    if (!perfil?.activo) {
      throw new BadRequestException(
        'El restaurante no tiene un perfil fiscal activo',
      );
    }
    if (!this.proveedores.obtener(perfil.proveedorCodigo)) {
      throw new BadRequestException(
        `El proveedor ${perfil.proveedorCodigo ?? 'no configurado'} no está soportado por esta instalación`,
      );
    }
    return this.prisma.transaccionSerializable(async (tx) => {
      const actualizado = await tx.documentoElectronico.updateMany({
        where: { id, estado: 'NUMERADO', outbox: null },
        data: { estado: 'EN_COLA' },
      });
      if (actualizado.count !== 1) {
        const existente = await tx.outboxFiscal.findUnique({
          where: { documentoId: id },
        });
        if (existente) return existente;
        throw new BadRequestException(
          'El documento ya no está disponible para encolar',
        );
      }
      const outbox = await tx.outboxFiscal.create({
        data: { documentoId: id },
      });
      await tx.historialDocumentoFiscal.create({
        data: {
          documentoId: id,
          estado: 'EN_COLA',
          actorId: usuarioActual.id,
          detalle: 'Documento agregado explícitamente a la cola fiscal',
        },
      });
      return outbox;
    });
  }

  async procesarPendientes(limite: number, usuarioActual: UsuarioAutenticado) {
    const resultados: Array<{
      documentoId: number;
      estado: string;
      mensaje?: string;
    }> = [];
    for (let indice = 0; indice < limite; indice += 1) {
      const item = await this.reclamarSiguiente(usuarioActual);
      if (!item) break;
      resultados.push(await this.procesarItem(item.id, item.documentoId));
    }
    return { procesados: resultados.length, resultados };
  }

  async consultarEstado(id: number, usuarioActual: UsuarioAutenticado) {
    const documento = await this.prisma.documentoElectronico.findFirst({
      where: { id, factura: { is: this.filtroFacturaTenant(usuarioActual) } },
      include: {
        factura: { include: { venta: { include: { sucursal: true } } } },
      },
    });
    if (!documento?.factura.venta) {
      throw new NotFoundException('Documento electrónico no encontrado');
    }
    if (!documento.proveedorReferencia || documento.estado !== 'ENVIADO') {
      throw new BadRequestException(
        'Sólo un documento ENVIADO con referencia puede consultarse',
      );
    }
    const perfil = await this.prisma.perfilFiscal.findUnique({
      where: { restauranteId: documento.factura.venta.sucursal.restauranteId },
    });
    const adapter = this.proveedores.obtener(perfil?.proveedorCodigo);
    if (!perfil?.activo || !adapter) {
      throw new BadRequestException('Perfil o adaptador fiscal no disponible');
    }
    const respuesta = await adapter.consultar(
      documento.proveedorReferencia,
      perfil,
    );
    if (
      respuesta.estado === 'ACEPTADO' &&
      (!respuesta.referencia || !respuesta.cufe || !respuesta.qrCode)
    ) {
      throw new BadRequestException(
        'La aceptación no contiene referencia, CUFE y QR verificables',
      );
    }
    const estado =
      respuesta.estado === 'ACEPTADO'
        ? 'ACEPTADO'
        : respuesta.estado === 'RECHAZADO'
          ? 'RECHAZADO'
          : 'ENVIADO';
    await this.prisma.documentoElectronico.update({
      where: { id },
      data: {
        estado,
        proveedorReferencia: respuesta.referencia,
        respuestaProveedor: respuesta.respuesta as Prisma.InputJsonValue,
        mensajeEstado: respuesta.mensaje,
        cufe: respuesta.cufe,
        qrCode: respuesta.qrCode,
        respondidoEn:
          estado === 'ACEPTADO' || estado === 'RECHAZADO' ? new Date() : null,
        historial: {
          create: {
            estado,
            actorId: usuarioActual.id,
            detalle:
              respuesta.mensaje ?? `Consulta normalizada: ${respuesta.estado}`,
          },
        },
      },
    });
    return {
      id,
      estado,
      referencia: respuesta.referencia,
      mensaje: respuesta.mensaje,
    };
  }

  private async reclamarSiguiente(usuarioActual: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const candidato = await tx.outboxFiscal.findFirst({
        where: {
          estado: 'PENDIENTE',
          disponibleEn: { lte: new Date() },
          documento: {
            factura: { is: this.filtroFacturaTenant(usuarioActual) },
          },
        },
        orderBy: [{ disponibleEn: 'asc' }, { id: 'asc' }],
      });
      if (!candidato) return null;
      const reclamado = await tx.outboxFiscal.updateMany({
        where: { id: candidato.id, estado: 'PENDIENTE' },
        data: {
          estado: 'PROCESANDO',
          bloqueadoEn: new Date(),
          intentos: { increment: 1 },
        },
      });
      if (reclamado.count !== 1) return null;
      await tx.documentoElectronico.update({
        where: { id: candidato.documentoId },
        data: { estado: 'ENVIANDO' },
      });
      return candidato;
    });
  }

  private async procesarItem(outboxId: number, documentoId: number) {
    const documento = await this.prisma.documentoElectronico.findUnique({
      where: { id: documentoId },
      include: {
        factura: { include: { venta: { include: { sucursal: true } } } },
      },
    });
    if (!documento?.factura.venta) {
      return this.fallarItem(
        outboxId,
        documentoId,
        'Documento sin venta fiscal compatible',
      );
    }
    const perfil = await this.prisma.perfilFiscal.findUnique({
      where: { restauranteId: documento.factura.venta.sucursal.restauranteId },
    });
    const adapter = this.proveedores.obtener(perfil?.proveedorCodigo);
    if (!perfil?.activo || !adapter) {
      return this.fallarItem(
        outboxId,
        documentoId,
        'Perfil o adaptador fiscal no disponible',
      );
    }
    try {
      const respuesta = await adapter.transmitir(documento, perfil);
      if (
        respuesta.estado === 'ACEPTADO' &&
        (!respuesta.referencia || !respuesta.cufe || !respuesta.qrCode)
      ) {
        throw new Error(
          'El proveedor informó aceptación sin referencia, CUFE o QR verificables',
        );
      }
      const estadoDocumento =
        respuesta.estado === 'ACEPTADO'
          ? 'ACEPTADO'
          : respuesta.estado === 'RECHAZADO'
            ? 'RECHAZADO'
            : 'ENVIADO';
      await this.prisma.$transaction([
        this.prisma.documentoElectronico.update({
          where: { id: documentoId },
          data: {
            estado: estadoDocumento,
            proveedorReferencia: respuesta.referencia,
            respuestaProveedor: respuesta.respuesta as Prisma.InputJsonValue,
            mensajeEstado: respuesta.mensaje,
            cufe: respuesta.cufe,
            qrCode: respuesta.qrCode,
            enviadoEn: new Date(),
            respondidoEn: respuesta.estado === 'PENDIENTE' ? null : new Date(),
          },
        }),
        this.prisma.outboxFiscal.update({
          where: { id: outboxId },
          data: { estado: 'COMPLETADO', bloqueadoEn: null, ultimoError: null },
        }),
        this.prisma.historialDocumentoFiscal.create({
          data: {
            documentoId,
            estado: estadoDocumento,
            detalle:
              respuesta.mensaje ?? `Respuesta normalizada: ${respuesta.estado}`,
          },
        }),
      ]);
      return {
        documentoId,
        estado: estadoDocumento,
        mensaje: respuesta.mensaje,
      };
    } catch (error) {
      return this.fallarItem(
        outboxId,
        documentoId,
        error instanceof Error ? error.message : 'Error fiscal no identificado',
      );
    }
  }

  private async fallarItem(
    outboxId: number,
    documentoId: number,
    mensaje: string,
  ) {
    const outbox = await this.prisma.outboxFiscal.findUnique({
      where: { id: outboxId },
    });
    const intentos = outbox?.intentos ?? 5;
    const agotado = intentos >= 5;
    const demoraMinutos = Math.min(2 ** Math.max(intentos - 1, 0), 60);
    await this.prisma.$transaction([
      this.prisma.outboxFiscal.update({
        where: { id: outboxId },
        data: {
          estado: agotado ? 'FALLIDO' : 'PENDIENTE',
          bloqueadoEn: null,
          ultimoError: mensaje.slice(0, 500),
          disponibleEn: new Date(Date.now() + demoraMinutos * 60_000),
        },
      }),
      this.prisma.documentoElectronico.update({
        where: { id: documentoId },
        data: {
          estado: agotado ? 'ERROR' : 'EN_COLA',
          mensajeEstado: mensaje.slice(0, 500),
        },
      }),
      this.prisma.historialDocumentoFiscal.create({
        data: {
          documentoId,
          estado: agotado ? 'ERROR' : 'EN_COLA',
          detalle: agotado
            ? `Reintentos agotados: ${mensaje}`.slice(0, 500)
            : `Reintento ${intentos}/5 programado: ${mensaje}`.slice(0, 500),
        },
      }),
    ]);
    return { documentoId, estado: agotado ? 'ERROR' : 'REINTENTO', mensaje };
  }

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
