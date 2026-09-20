import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve, sep } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { GuardarCartaDiaDto } from './dto/guardar-carta-dia.dto';
import {
  GuardarIdentidadCartaDto,
  GuardarPerfilCartaDto,
} from './dto/perfil-carta.dto';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RECURSO_RE = /^[0-9a-f-]{36}\.(png|jpe?g|webp)$/i;

export type ArchivoCarta = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

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

function plantillaPredeterminada() {
  return {
    titulo: 'Menú',
    subtitulo: '',
    pie: '',
    estilo: 'EDITORIAL_DORADO',
    mostrarPrecios: true,
    mostrarImagenesProductos: false,
    fondoColor: '#F3EDE1',
    tarjetaColor: '#FFFDF8',
    textoColor: '#14283B',
    acentoColor: '#B98A2D',
    encabezadoColor: '#14283B',
    logoUrl: null,
    fondoImagenUrl: null,
    fondoImagenOpacidad: 0.12,
    tarjetaOpacidad: 0.82,
    secciones: [],
  };
}

function contenidoPredeterminado() {
  return {
    titulo: '',
    subtitulo: '',
    grupos: [],
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
  private readonly storage = this.resolverDirectorio();

  constructor(private readonly prisma: PrismaService) {}

  async obtenerIdentidad(sucursalId: number, usuario: UsuarioAutenticado) {
    const sucursal = await this.sucursalEnAlcance(sucursalId, usuario);
    const config = await this.prisma.configuracionRestaurante.findUnique({
      where: {
        restauranteId_clave: {
          restauranteId: sucursal.restauranteId,
          clave: 'CARTA_IDENTIDAD',
        },
      },
      select: { valor: true, actualizadoEn: true },
    });
    const valor =
      config?.valor &&
      typeof config.valor === 'object' &&
      !Array.isArray(config.valor)
        ? (config.valor as Record<string, unknown>)
        : {};
    return {
      restauranteId: sucursal.restauranteId,
      logoUrl: typeof valor.logoUrl === 'string' ? valor.logoUrl : null,
      actualizadoEn: config?.actualizadoEn ?? null,
    };
  }

  async guardarIdentidad(
    sucursalId: number,
    dto: GuardarIdentidadCartaDto,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.sucursalEnAlcance(sucursalId, usuario);
    const valor = { logoUrl: dto.logoUrl || null };
    const config = await this.prisma.configuracionRestaurante.upsert({
      where: {
        restauranteId_clave: {
          restauranteId: sucursal.restauranteId,
          clave: 'CARTA_IDENTIDAD',
        },
      },
      update: { valor },
      create: {
        restauranteId: sucursal.restauranteId,
        clave: 'CARTA_IDENTIDAD',
        valor,
      },
      select: { actualizadoEn: true },
    });
    return {
      restauranteId: sucursal.restauranteId,
      ...valor,
      actualizadoEn: config.actualizadoEn,
    };
  }

  async listarPerfiles(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    await this.asegurarPerfilInicial(sucursalId);
    return this.prisma.perfilCarta.findMany({
      where: { sucursalId },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
  }

  async crearPerfil(
    sucursalId: number,
    dto: GuardarPerfilCartaDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    await this.validarPlantilla(sucursalId, dto);
    return this.prisma.$transaction(async (tx) => {
      if (dto.predeterminada) {
        await tx.perfilCarta.updateMany({
          where: { sucursalId },
          data: { predeterminada: false },
        });
      }
      const existentes = await tx.perfilCarta.count({ where: { sucursalId } });
      return tx.perfilCarta.create({
        data: {
          sucursalId,
          ...this.datosPerfil(dto),
          predeterminada: dto.predeterminada || existentes === 0,
        },
      });
    });
  }

  async actualizarPerfil(
    sucursalId: number,
    perfilId: number,
    dto: GuardarPerfilCartaDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    await this.perfilEnSucursal(sucursalId, perfilId);
    await this.validarPlantilla(sucursalId, dto);
    return this.prisma.$transaction(async (tx) => {
      if (dto.predeterminada) {
        await tx.perfilCarta.updateMany({
          where: { sucursalId, id: { not: perfilId } },
          data: { predeterminada: false },
        });
      }
      return tx.perfilCarta.update({
        where: { id: perfilId },
        data: this.datosPerfil(dto),
      });
    });
  }

  async obtenerPerfil(
    sucursalId: number,
    perfilId: number,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    return this.perfilEnSucursal(sucursalId, perfilId);
  }

  async obtenerCartaPerfil(
    sucursalId: number,
    perfilId: number,
    fecha: string,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    await this.perfilEnSucursal(sucursalId, perfilId);
    const carta = await this.prisma.cartaDia.findUnique({
      where: {
        perfilCartaId_fecha: { perfilCartaId: perfilId, fecha: fechaDb(fecha) },
      },
    });
    if (!carta) {
      return {
        id: null,
        sucursalId,
        perfilCartaId: perfilId,
        fecha,
        publicada: false,
        contenido: contenidoPredeterminado(),
        actualizadoEn: null,
      };
    }
    return { ...carta, fecha };
  }

  async guardarCartaPerfil(
    sucursalId: number,
    perfilId: number,
    fecha: string,
    dto: GuardarCartaDiaDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    await this.perfilEnSucursal(sucursalId, perfilId);
    const contenido = this.normalizarContenido(dto.contenido);
    const carta = await this.prisma.cartaDia.upsert({
      where: {
        perfilCartaId_fecha: { perfilCartaId: perfilId, fecha: fechaDb(fecha) },
      },
      update: {
        contenido,
        publicada: dto.publicada,
      },
      create: {
        sucursalId,
        perfilCartaId: perfilId,
        fecha: fechaDb(fecha),
        contenido,
        publicada: dto.publicada,
      },
    });
    return { ...carta, fecha };
  }

  async guardarRecurso(
    sucursalId: number,
    archivo: ArchivoCarta,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.sucursalEnAlcance(sucursalId, usuario);
    const extensiones: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
    };
    const extension = extensiones[archivo.mimetype];
    if (!extension) {
      throw new BadRequestException('Usa una imagen PNG, JPG o WEBP');
    }
    const nombre = `${randomUUID()}${extension}`;
    const directorio = this.directorioRecursos(sucursal.restauranteId);
    await mkdir(directorio, { recursive: true });
    await writeFile(resolve(directorio, nombre), archivo.buffer);
    return {
      url: `/media/cartas/${sucursal.restauranteId}/${nombre}`,
      nombreOriginal: archivo.originalname,
    };
  }

  async leerRecurso(restauranteId: number, archivo: string) {
    if (!RECURSO_RE.test(archivo) || extname(archivo).length < 4) {
      throw new NotFoundException('Recurso no encontrado');
    }
    const ruta = resolve(this.directorioRecursos(restauranteId), archivo);
    this.validarRutaDentroStorage(ruta);
    try {
      const contenido = await readFile(ruta);
      const extension = extname(archivo).toLowerCase();
      const mime =
        extension === '.png'
          ? 'image/png'
          : extension === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
      return { contenido, mime };
    } catch {
      throw new NotFoundException('Recurso no encontrado');
    }
  }

  // Compatibilidad temporal con S56/S56B: trabaja sobre el perfil predeterminado.
  async obtener(
    sucursalId: number,
    fecha: string,
    usuario: UsuarioAutenticado,
  ) {
    const perfil = await this.perfilPredeterminado(sucursalId, usuario);
    return this.obtenerCartaPerfil(sucursalId, perfil.id, fecha, usuario);
  }

  async guardar(
    sucursalId: number,
    fecha: string,
    dto: GuardarCartaDiaDto,
    usuario: UsuarioAutenticado,
  ) {
    const perfil = await this.perfilPredeterminado(sucursalId, usuario);
    return this.guardarCartaPerfil(sucursalId, perfil.id, fecha, dto, usuario);
  }

  private datosPerfil(dto: GuardarPerfilCartaDto) {
    return {
      nombre: dto.nombre.trim() || 'Carta',
      descripcion: dto.descripcion?.trim() || null,
      estado: dto.estado,
      predeterminada: dto.predeterminada,
      orden: dto.orden,
      modoActivacion: dto.modoActivacion,
      activoManual: dto.activoManual,
      horaInicio: dto.modoActivacion === 'HORARIO' ? dto.horaInicio : null,
      horaFin: dto.modoActivacion === 'HORARIO' ? dto.horaFin : null,
      diasSemana: [...new Set(dto.diasSemana)].sort() as Prisma.InputJsonValue,
      plantilla: this.normalizarPlantilla(dto) as Prisma.InputJsonValue,
    };
  }

  private normalizarPlantilla(dto: GuardarPerfilCartaDto) {
    const p = dto.plantilla;
    return {
      titulo: p.titulo.trim() || dto.nombre.trim() || 'Menú',
      subtitulo: p.subtitulo?.trim() || '',
      pie: p.pie?.trim() || '',
      estilo: p.estilo,
      mostrarPrecios: p.mostrarPrecios,
      mostrarImagenesProductos: p.mostrarImagenesProductos,
      fondoColor: p.fondoColor ?? '#F3EDE1',
      tarjetaColor: p.tarjetaColor ?? '#FFFDF8',
      textoColor: p.textoColor ?? '#14283B',
      acentoColor: p.acentoColor ?? '#B98A2D',
      encabezadoColor: p.encabezadoColor ?? '#14283B',
      logoUrl: p.logoUrl || null,
      fondoImagenUrl: p.fondoImagenUrl || null,
      fondoImagenOpacidad: p.fondoImagenOpacidad,
      tarjetaOpacidad: p.tarjetaOpacidad,
      secciones: p.secciones
        .map((seccion) => ({
          categoriaId: seccion.categoriaId,
          titulo: seccion.titulo.trim(),
          productoIds: [...new Set(seccion.productoIds)],
        }))
        .filter((seccion) => seccion.titulo && seccion.productoIds.length > 0),
    };
  }

  private async validarPlantilla(
    sucursalId: number,
    dto: GuardarPerfilCartaDto,
  ) {
    if (dto.modoActivacion === 'HORARIO' && (!dto.horaInicio || !dto.horaFin)) {
      throw new BadRequestException(
        'Una carta por horario requiere hora de inicio y fin',
      );
    }
    const ids = [
      ...new Set(dto.plantilla.secciones.flatMap((s) => s.productoIds)),
    ];
    if (!ids.length) return;
    const productos = await this.prisma.producto.count({
      where: {
        id: { in: ids },
        categoria: { sucursalId },
      },
    });
    if (productos !== ids.length) {
      throw new BadRequestException(
        'La carta contiene productos que no pertenecen a la sucursal',
      );
    }
  }

  private normalizarContenido(contenido: GuardarCartaDiaDto['contenido']) {
    const especialNombre = contenido.especial?.nombre?.trim() ?? '';
    return {
      titulo: contenido.titulo?.trim() || '',
      subtitulo: contenido.subtitulo?.trim() || '',
      precioBase: contenido.precioBase,
      grupos: (contenido.grupos ?? [])
        .map((grupo) => ({
          titulo: grupo.titulo.trim(),
          opciones: grupo.opciones.map((item) => item.trim()).filter(Boolean),
        }))
        .filter((grupo) => grupo.titulo && grupo.opciones.length),
      especial: especialNombre
        ? {
            titulo: contenido.especial?.titulo?.trim() || 'Especial de hoy',
            nombre: especialNombre,
            descripcion: contenido.especial?.descripcion?.trim() || '',
            precio: contenido.especial?.precio,
          }
        : null,
      mensaje: contenido.mensaje?.trim() || '',
    };
  }

  private async perfilPredeterminado(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    await this.asegurarPerfilInicial(sucursalId);
    const perfil = await this.prisma.perfilCarta.findFirst({
      where: { sucursalId },
      orderBy: [{ predeterminada: 'desc' }, { orden: 'asc' }, { id: 'asc' }],
    });
    if (!perfil) throw new NotFoundException('No hay cartas configuradas');
    return perfil;
  }

  private async asegurarPerfilInicial(sucursalId: number) {
    const existe = await this.prisma.perfilCarta.count({
      where: { sucursalId },
    });
    if (existe) return;
    await this.prisma.perfilCarta.create({
      data: {
        sucursalId,
        nombre: 'Carta principal',
        descripcion: 'Configura los productos y la presentación de esta carta',
        estado: true,
        predeterminada: true,
        orden: 0,
        modoActivacion: 'SIEMPRE',
        activoManual: false,
        diasSemana: [1, 2, 3, 4, 5, 6, 7],
        plantilla: plantillaPredeterminada(),
      },
    });
  }

  private async perfilEnSucursal(sucursalId: number, perfilId: number) {
    const perfil = await this.prisma.perfilCarta.findFirst({
      where: { id: perfilId, sucursalId },
    });
    if (!perfil) throw new NotFoundException('Carta no encontrada');
    return perfil;
  }

  private async sucursalEnAlcance(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: { id: true, restauranteId: true },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    if (
      usuario.restauranteId !== sucursal.restauranteId ||
      (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId)
    ) {
      throw new ForbiddenException('Sucursal fuera del alcance del usuario');
    }
    return sucursal;
  }

  private resolverDirectorio() {
    const configurado = process.env.MEDIA_STORAGE_DIR?.trim();
    return configurado
      ? isAbsolute(configurado)
        ? configurado
        : resolve(process.cwd(), configurado)
      : resolve(process.cwd(), 'storage', 'media');
  }

  private directorioRecursos(restauranteId: number) {
    const ruta = resolve(
      this.storage,
      `restaurante-${restauranteId}`,
      'cartas',
    );
    this.validarRutaDentroStorage(ruta);
    return ruta;
  }

  private validarRutaDentroStorage(ruta: string) {
    const raiz = resolve(this.storage) + sep;
    const normalizada = resolve(ruta);
    if (!normalizada.startsWith(raiz)) {
      throw new BadRequestException('Ruta de media inválida');
    }
  }
}
