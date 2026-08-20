import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ConfigurarPerfilFiscalDto } from './dto/configurar-perfil-fiscal.dto';
import { CrearResolucionDto } from './dto/crear-resolucion.dto';
import { ProveedorFiscalRegistry } from './proveedores/proveedor-fiscal.registry';

@Injectable()
export class FiscalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proveedores: ProveedorFiscalRegistry,
  ) {}

  async diagnosticarAlta(restauranteId: number, usuario: UsuarioAutenticado) {
    this.autorizarRestaurante(restauranteId, usuario);
    const restaurante = await this.prisma.restaurante.findFirst({
      where: { id: restauranteId, estado: true },
      include: {
        perfilFiscal: true,
        resolucionesDian: { where: { activa: true } },
      },
    });
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado');
    const perfil = restaurante.perfilFiscal;
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    const resolucionesVigentes = restaurante.resolucionesDian.filter(
      (r) =>
        r.vigenteDesde <= hoy &&
        r.vigenteHasta >= hoy &&
        r.siguienteNumero <= r.rangoHasta,
    );
    const adapter = this.proveedores.obtener(perfil?.proveedorCodigo);
    const referenciasSeguras = perfil
      ? [perfil.credencialRef, perfil.certificadoRef, perfil.softwareIdRef]
          .filter((ref): ref is string => Boolean(ref))
          .every((ref) => ref.startsWith('secret://'))
      : false;
    const checks = {
      restauranteActivo: true,
      perfilFiscalActivo: Boolean(perfil?.activo),
      datosFiscalesCompletos: Boolean(
        perfil?.responsabilidadFiscal && perfil.municipioCodigo,
      ),
      referenciasSecretasSeguras: referenciasSeguras,
      resolucionVigenteDisponible: resolucionesVigentes.length > 0,
      proveedorConfigurado: Boolean(perfil?.proveedorCodigo),
      proveedorSoportado: Boolean(adapter),
    };
    let proveedorDiagnostico: { disponible: boolean; mensaje: string } = {
      disponible: false,
      mensaje: perfil?.proveedorCodigo
        ? `No existe un adaptador registrado para ${perfil.proveedorCodigo}`
        : 'No se ha seleccionado proveedor fiscal',
    };
    if (adapter && perfil)
      proveedorDiagnostico = await adapter.diagnosticar(perfil);
    const listoConfiguracion =
      checks.restauranteActivo &&
      checks.perfilFiscalActivo &&
      checks.datosFiscalesCompletos &&
      checks.referenciasSecretasSeguras &&
      checks.resolucionVigenteDisponible &&
      checks.proveedorConfigurado;
    return {
      restauranteId,
      ambiente: perfil?.ambiente ?? null,
      modoOperacion: perfil?.modoOperacion ?? null,
      checks,
      listoConfiguracion,
      listoTransmision:
        listoConfiguracion &&
        checks.proveedorSoportado &&
        proveedorDiagnostico.disponible,
      proveedorDiagnostico,
      resolucionesVigentes: resolucionesVigentes.length,
    };
  }

  async resumenOperacion(restauranteId: number, usuario: UsuarioAutenticado) {
    this.autorizarRestaurante(restauranteId, usuario);
    const restaurante = await this.prisma.restaurante.findFirst({
      where: { id: restauranteId, estado: true },
      select: { id: true },
    });
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado');
    const documentos = await this.prisma.documentoElectronico.groupBy({
      by: ['estado'],
      where: { factura: { venta: { sucursal: { restauranteId } } } },
      _count: { _all: true },
    });
    const outbox = await this.prisma.outboxFiscal.groupBy({
      by: ['estado'],
      where: {
        documento: { factura: { venta: { sucursal: { restauranteId } } } },
      },
      _count: { _all: true },
    });
    return {
      restauranteId,
      documentos: Object.fromEntries(
        documentos.map((item) => [item.estado, item._count._all]),
      ),
      outbox: Object.fromEntries(
        outbox.map((item) => [item.estado, item._count._all]),
      ),
    };
  }

  private autorizarRestaurante(
    restauranteId: number,
    usuario: UsuarioAutenticado,
  ) {
    const superadmin =
      usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
    if (!superadmin && usuario.restauranteId !== restauranteId) {
      throw new NotFoundException('Restaurante no encontrado');
    }
  }

  async obtenerPerfil(restauranteId: number, usuario: UsuarioAutenticado) {
    this.autorizarRestaurante(restauranteId, usuario);
    return this.prisma.perfilFiscal.findUnique({ where: { restauranteId } });
  }

  async configurarPerfil(
    restauranteId: number,
    data: ConfigurarPerfilFiscalDto,
    usuario: UsuarioAutenticado,
  ) {
    this.autorizarRestaurante(restauranteId, usuario);
    if (
      data.activo &&
      data.modoOperacion === 'PROVEEDOR_TECNOLOGICO' &&
      (!data.proveedorCodigo || !data.credencialRef)
    ) {
      throw new BadRequestException(
        'Un perfil activo con proveedor requiere proveedorCodigo y credencialRef',
      );
    }
    if (
      data.activo &&
      data.modoOperacion === 'SOFTWARE_PROPIO' &&
      (!data.softwareIdRef || !data.certificadoRef)
    ) {
      throw new BadRequestException(
        'Software propio activo requiere softwareIdRef y certificadoRef',
      );
    }
    const restaurante = await this.prisma.restaurante.findFirst({
      where: { id: restauranteId, estado: true },
    });
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado');
    return this.prisma.perfilFiscal.upsert({
      where: { restauranteId },
      create: { ...data, restauranteId },
      update: data,
    });
  }

  async listarResoluciones(restauranteId: number, usuario: UsuarioAutenticado) {
    this.autorizarRestaurante(restauranteId, usuario);
    return this.prisma.resolucionNumeracionDian.findMany({
      where: { restauranteId },
      orderBy: [{ activa: 'desc' }, { vigenteHasta: 'desc' }],
    });
  }

  async crearResolucion(
    restauranteId: number,
    data: CrearResolucionDto,
    usuario: UsuarioAutenticado,
  ) {
    this.autorizarRestaurante(restauranteId, usuario);
    const desde = data.rangoDesde;
    const hasta = data.rangoHasta;
    const siguiente = data.siguienteNumero ?? data.rangoDesde;
    if (desde > hasta || siguiente < desde || siguiente > hasta) {
      throw new BadRequestException(
        'El rango y el siguiente número no son coherentes',
      );
    }
    const vigenteDesde = new Date(data.vigenteDesde);
    const vigenteHasta = new Date(data.vigenteHasta);
    if (vigenteDesde > vigenteHasta)
      throw new BadRequestException(
        'La vigencia de la resolución no es válida',
      );
    if (data.sucursalId) {
      const sucursal = await this.prisma.sucursal.findFirst({
        where: { id: data.sucursalId, restauranteId, estado: true },
      });
      if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    }
    try {
      return await this.prisma.resolucionNumeracionDian.create({
        data: {
          ...data,
          rangoDesde: desde,
          rangoHasta: hasta,
          siguienteNumero: siguiente,
          vigenteDesde,
          vigenteHasta,
          restauranteId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('La resolución y el prefijo ya existen');
      }
      throw error;
    }
  }
}
