import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { GuardarCartaDiaDto } from './dto/guardar-carta-dia.dto';
import { GuardarPlantillaCartaDto } from './dto/guardar-plantilla-carta.dto';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function fechaDb(fecha: string) {
  if (!FECHA_RE.test(fecha)) {
    throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
  }
  const valor = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(valor.getTime())) {
    throw new BadRequestException('Fecha inválida');
  }
  return valor;
}

function contenidoPredeterminado() {
  return {
    titulo: 'Almuerzo del día',
    subtitulo: '',
    precioBase: undefined,
    grupos: [
      { titulo: 'Proteínas disponibles', opciones: [] },
      { titulo: 'Acompañamientos', opciones: [] },
    ],
    especial: {
      titulo: 'Especial de hoy',
      nombre: '',
      descripcion: '',
      precio: undefined,
    },
    mensaje: '',
  };
}

@Injectable()
export class CartaDiaService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(
    sucursalId: number,
    fecha: string,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    const carta = await this.prisma.cartaDia.findUnique({
      where: {
        sucursalId_fecha: {
          sucursalId,
          fecha: fechaDb(fecha),
        },
      },
    });
    if (!carta) {
      return {
        id: null,
        sucursalId,
        fecha,
        publicada: false,
        contenido: contenidoPredeterminado(),
        actualizadoEn: null,
      };
    }
    return {
      ...carta,
      fecha: fecha.slice(0, 10),
    };
  }

  async guardar(
    sucursalId: number,
    fecha: string,
    dto: GuardarCartaDiaDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    const contenido = this.normalizarContenido(dto.contenido);
    const carta = await this.prisma.cartaDia.upsert({
      where: {
        sucursalId_fecha: {
          sucursalId,
          fecha: fechaDb(fecha),
        },
      },
      update: {
        contenido: contenido as Prisma.InputJsonValue,
        publicada: dto.publicada,
      },
      create: {
        sucursalId,
        fecha: fechaDb(fecha),
        contenido: contenido as Prisma.InputJsonValue,
        publicada: dto.publicada,
      },
    });
    return {
      ...carta,
      fecha,
    };
  }

  async obtenerPlantilla(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    const configuracion = await this.prisma.configuracionSucursal.findUnique({
      where: {
        sucursalId_clave: {
          sucursalId,
          clave: 'CARTA_PLANTILLA',
        },
      },
      select: { valor: true, actualizadoEn: true },
    });
    const valor = configuracion?.valor;
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
      return {
        sucursalId,
        titulo: 'Menú de almuerzos',
        subtitulo: '',
        pie: '',
        estilo: 'EDITORIAL_DORADO',
        mostrarPrecios: true,
        secciones: [],
        actualizadoEn: null,
      };
    }
    return { sucursalId, ...(valor as object), actualizadoEn: configuracion.actualizadoEn };
  }

  async guardarPlantilla(
    sucursalId: number,
    dto: GuardarPlantillaCartaDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    const valor = {
      titulo: dto.titulo.trim() || 'Menú de almuerzos',
      subtitulo: dto.subtitulo?.trim() || '',
      pie: dto.pie?.trim() || '',
      estilo: dto.estilo,
      mostrarPrecios: dto.mostrarPrecios,
      secciones: dto.secciones
        .map((seccion) => ({
          categoriaId: seccion.categoriaId,
          titulo: seccion.titulo.trim(),
          productoIds: [...new Set(seccion.productoIds)],
        }))
        .filter((seccion) => seccion.titulo && seccion.productoIds.length > 0),
    };
    const configuracion = await this.prisma.configuracionSucursal.upsert({
      where: {
        sucursalId_clave: {
          sucursalId,
          clave: 'CARTA_PLANTILLA',
        },
      },
      update: { valor: valor as Prisma.InputJsonValue },
      create: {
        sucursalId,
        clave: 'CARTA_PLANTILLA',
        valor: valor as Prisma.InputJsonValue,
      },
      select: { actualizadoEn: true },
    });
    return { sucursalId, ...valor, actualizadoEn: configuracion.actualizadoEn };
  }

  private normalizarContenido(contenido: GuardarCartaDiaDto['contenido']) {
    const grupos = contenido.grupos
      .map((grupo) => ({
        titulo: grupo.titulo.trim(),
        opciones: grupo.opciones
          .map((opcion) => opcion.trim())
          .filter(Boolean)
          .slice(0, 20),
      }))
      .filter((grupo) => grupo.titulo && grupo.opciones.length > 0)
      .slice(0, 10);

    const especialNombre = contenido.especial?.nombre?.trim() ?? '';
    return {
      titulo: contenido.titulo.trim() || 'Almuerzo del día',
      subtitulo: contenido.subtitulo?.trim() || '',
      precioBase: contenido.precioBase,
      grupos,
      especial: especialNombre
        ? {
            titulo:
              contenido.especial?.titulo?.trim() || 'Especial de hoy',
            nombre: especialNombre,
            descripcion: contenido.especial?.descripcion?.trim() || '',
            precio: contenido.especial?.precio,
          }
        : null,
      mensaje: contenido.mensaje?.trim() || '',
    };
  }

  private async sucursalEnAlcance(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: { id: true, restauranteId: true },
    });
    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada');
    }
    if (
      usuario.restauranteId !== sucursal.restauranteId ||
      (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId)
    ) {
      throw new ForbiddenException('Sucursal fuera del alcance del usuario');
    }
    return sucursal;
  }
}
