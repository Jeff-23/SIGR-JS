import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { MenuQrService } from './menu-qr.service';

type PublicProductImage = {
  restauranteId: number;
  productoId: number;
  tokenPublico: string;
};

type PublicTemplate = {
  fondoImagenUrl?: string | null;
  logoUrl?: string | null;
  [key: string]: unknown;
};

type PublicSnapshot = {
  identidadCarta?: { logoUrl?: string | null } | null;
  perfilesCarta?: Array<{ plantilla?: PublicTemplate; [key: string]: unknown }>;
  plantillaCarta?: PublicTemplate | null;
  categorias?: Array<{
    productos?: Array<{
      imagenPrincipal?: PublicProductImage | null;
      imagenPublica?: string | null;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type PublicacionEstado = {
  activa: boolean;
  configurada: boolean;
  baseUrl: string | null;
  publicadaEn?: string;
  versionHash?: string;
  ultimoError?: string | null;
  sucursalGlobalId?: string;
  mesas?: Array<{ id: number; globalId: string; numero: string; url: string }>;
};

@Injectable()
export class MenuPublicacionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MenuPublicacionService.name);
  private timer?: NodeJS.Timeout;
  private readonly hashes = new Map<number, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly menuQr: MenuQrService,
  ) {}

  onModuleInit() {
    if (!this.habilitadaPorEntorno()) return;
    const intervalo = Math.max(
      30_000,
      Number(process.env.PUBLIC_MENU_INTERVAL_MS || 60_000),
    );
    this.timer = setInterval(() => void this.publicarActivas(), intervalo);
    this.timer.unref();
    setTimeout(() => void this.publicarActivas(), 5_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async estado(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    return this.estadoInterno(sucursalId);
  }

  async publicar(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    await this.prisma.configuracionSucursal.upsert({
      where: { sucursalId_clave: { sucursalId, clave: 'MENU_PUBLICO_ACTIVO' } },
      update: { valor: true },
      create: { sucursalId, clave: 'MENU_PUBLICO_ACTIVO', valor: true },
    });
    return this.publicarSucursal(sucursalId, true);
  }

  async desactivar(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.sucursalEnAlcance(sucursalId, usuario);
    this.validarEntorno();
    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: { globalId: true },
    });
    if (!sucursal) throw new BadRequestException('Sucursal no encontrada');

    const deleteUrl = `${this.baseUrl()}/admin/publish/${sucursal.globalId}`;
    try {
      const respuesta = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${process.env.PUBLIC_MENU_PUBLISH_TOKEN}`,
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => '');
        throw new Error(
          `HTTP ${respuesta.status}${detalle ? `: ${detalle.slice(0, 250)}` : ''}`,
        );
      }
    } catch (error) {
      await this.guardarEstado(sucursalId, {
        ultimoError: `No se pudo retirar la carta pública: ${this.mensaje(error)}`,
      });
      throw new BadRequestException(
        'No se pudo retirar la carta pública. La publicación permanece activa para evitar un estado inconsistente.',
      );
    }

    await this.prisma.configuracionSucursal.upsert({
      where: { sucursalId_clave: { sucursalId, clave: 'MENU_PUBLICO_ACTIVO' } },
      update: { valor: false },
      create: { sucursalId, clave: 'MENU_PUBLICO_ACTIVO', valor: false },
    });
    this.hashes.delete(sucursalId);
    await this.guardarEstado(sucursalId, {
      publicadaEn: null,
      versionHash: null,
      ultimoError: null,
    });
    return this.estadoInterno(sucursalId);
  }

  private async publicarActivas() {
    const configuraciones = await this.prisma.configuracionSucursal.findMany({
      where: { clave: 'MENU_PUBLICO_ACTIVO', valor: { equals: true } },
      select: { sucursalId: true },
    });
    for (const item of configuraciones) {
      try {
        await this.publicarSucursal(item.sucursalId, false);
      } catch (error) {
        this.logger.warn(
          `No se pudo publicar menú de sucursal ${item.sucursalId}: ${this.mensaje(error)}`,
        );
      }
    }
  }

  private async publicarSucursal(sucursalId: number, forzar: boolean) {
    this.validarEntorno();
    const modo = await this.prisma.configuracionSucursal.findUnique({
      where: { sucursalId_clave: { sucursalId, clave: 'QR_MODO' } },
      select: { valor: true },
    });
    if (modo?.valor !== 'SOLO_MENU') {
      throw new BadRequestException(
        'La publicación pública inicial sólo está habilitada para QR en modo SOLO_MENU',
      );
    }

    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: {
        id: true,
        globalId: true,
        nombre: true,
        restauranteId: true,
        zonas: {
          where: { estado: true },
          select: {
            mesas: {
              where: { estado: true },
              orderBy: { numero: 'asc' },
              select: {
                id: true,
                globalId: true,
                numero: true,
                accesoQr: true,
              },
            },
          },
        },
      },
    });
    if (!sucursal) throw new BadRequestException('Sucursal no encontrada');
    const mesas = sucursal.zonas.flatMap((zona) => zona.mesas);
    if (!mesas.length)
      throw new BadRequestException('La sucursal no tiene mesas activas');

    for (const mesa of mesas) {
      if (!mesa.accesoQr) {
        await this.prisma.accesoMesaQr.create({
          data: {
            mesaId: mesa.id,
            token: randomUUID().replaceAll('-', ''),
            activo: true,
          },
        });
      } else if (!mesa.accesoQr.activo) {
        await this.prisma.accesoMesaQr.update({
          where: { mesaId: mesa.id },
          data: { activo: true },
        });
      }
    }

    const acceso = await this.prisma.accesoMesaQr.findFirst({
      where: { mesaId: { in: mesas.map((mesa) => mesa.id) }, activo: true },
      orderBy: { mesaId: 'asc' },
      select: { token: true },
    });
    if (!acceso)
      throw new BadRequestException('No se pudo preparar el acceso QR');

    const menu = await this.menuQr.menu(acceso.token);
    const snapshot = await this.embebirRecursos({
      ...menu,
      modoQr: 'SOLO_MENU' as const,
      pedidosHabilitados: false,
      requiereAceptacion: false,
      mesa: undefined,
      mesas: mesas.map((mesa) => ({
        globalId: mesa.globalId,
        numero: mesa.numero,
      })),
    } as unknown as PublicSnapshot);
    const serialized = JSON.stringify(snapshot);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > 22 * 1024 * 1024) {
      throw new BadRequestException(
        'La carta pública supera el tamaño seguro de publicación (22 MB). Reduce fotos o fondos.',
      );
    }
    const hash = createHash('sha256').update(serialized).digest('hex');
    if (!forzar && this.hashes.get(sucursalId) === hash) {
      return this.estadoInterno(sucursalId);
    }

    const baseUrl = this.baseUrl();
    const publishUrl = `${baseUrl}/admin/publish`;
    try {
      const respuesta = await fetch(publishUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.PUBLIC_MENU_PUBLISH_TOKEN}`,
        },
        body: JSON.stringify({
          branchId: sucursal.globalId,
          publishedAt: new Date().toISOString(),
          versionHash: hash,
          snapshot,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => '');
        throw new Error(
          `HTTP ${respuesta.status}${detalle ? `: ${detalle.slice(0, 250)}` : ''}`,
        );
      }
      this.hashes.set(sucursalId, hash);
      await this.guardarEstado(sucursalId, {
        publicadaEn: new Date().toISOString(),
        versionHash: hash,
        ultimoError: null,
      });
      return this.estadoInterno(sucursalId);
    } catch (error) {
      await this.guardarEstado(sucursalId, {
        ultimoError: this.mensaje(error),
      });
      throw error;
    }
  }

  private async estadoInterno(sucursalId: number): Promise<PublicacionEstado> {
    const [activaConfig, estadoConfig, sucursal] = await Promise.all([
      this.prisma.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: { sucursalId, clave: 'MENU_PUBLICO_ACTIVO' },
        },
        select: { valor: true },
      }),
      this.prisma.configuracionSucursal.findUnique({
        where: {
          sucursalId_clave: { sucursalId, clave: 'MENU_PUBLICO_ESTADO' },
        },
        select: { valor: true },
      }),
      this.prisma.sucursal.findUnique({
        where: { id: sucursalId },
        select: {
          globalId: true,
          zonas: {
            where: { estado: true },
            select: {
              mesas: {
                where: { estado: true },
                select: { id: true, globalId: true, numero: true },
              },
            },
          },
        },
      }),
    ]);
    const valor =
      estadoConfig?.valor &&
      typeof estadoConfig.valor === 'object' &&
      !Array.isArray(estadoConfig.valor)
        ? (estadoConfig.valor as Record<string, unknown>)
        : {};
    const baseUrl = this.baseUrlOpcional();
    const mesas =
      sucursal && baseUrl
        ? sucursal.zonas
            .flatMap((zona) => zona.mesas)
            .map((mesa) => ({
              ...mesa,
              url: `${baseUrl}/menu/${sucursal.globalId}/${mesa.globalId}`,
            }))
        : undefined;
    return {
      activa: activaConfig?.valor === true,
      configurada: this.habilitadaPorEntorno(),
      baseUrl,
      publicadaEn:
        typeof valor.publicadaEn === 'string' ? valor.publicadaEn : undefined,
      versionHash:
        typeof valor.versionHash === 'string' ? valor.versionHash : undefined,
      ultimoError:
        typeof valor.ultimoError === 'string' ? valor.ultimoError : null,
      sucursalGlobalId: sucursal?.globalId,
      mesas,
    };
  }

  private async guardarEstado(
    sucursalId: number,
    cambio: Record<string, unknown>,
  ) {
    const actual = await this.prisma.configuracionSucursal.findUnique({
      where: { sucursalId_clave: { sucursalId, clave: 'MENU_PUBLICO_ESTADO' } },
      select: { valor: true },
    });
    const base =
      actual?.valor &&
      typeof actual.valor === 'object' &&
      !Array.isArray(actual.valor)
        ? (actual.valor as Record<string, unknown>)
        : {};
    const valor = { ...base, ...cambio } as Prisma.InputJsonObject;
    await this.prisma.configuracionSucursal.upsert({
      where: { sucursalId_clave: { sucursalId, clave: 'MENU_PUBLICO_ESTADO' } },
      update: { valor },
      create: { sucursalId, clave: 'MENU_PUBLICO_ESTADO', valor },
    });
  }

  private async embebirRecursos(
    snapshot: PublicSnapshot,
  ): Promise<PublicSnapshot> {
    // El menú puede contener Prisma.Decimal y otros valores serializables
    // que structuredClone no puede clonar. Para el snapshot público necesitamos
    // precisamente la representación JSON que luego enviaremos a Cloudflare.
    const copia = JSON.parse(JSON.stringify(snapshot)) as PublicSnapshot;
    const logo = copia.identidadCarta?.logoUrl;
    if (logo) {
      copia.identidadCarta = {
        ...copia.identidadCarta,
        logoUrl: await this.cartaDataUrl(logo),
      };
    }
    for (const perfil of copia.perfilesCarta ?? []) {
      const plantilla = perfil.plantilla;
      if (!plantilla) continue;
      if (plantilla.fondoImagenUrl) {
        plantilla.fondoImagenUrl = await this.cartaDataUrl(
          plantilla.fondoImagenUrl,
        );
      }
      if (plantilla.logoUrl) {
        plantilla.logoUrl = await this.cartaDataUrl(plantilla.logoUrl);
      }
    }
    if (copia.plantillaCarta?.fondoImagenUrl) {
      copia.plantillaCarta.fondoImagenUrl = await this.cartaDataUrl(
        copia.plantillaCarta.fondoImagenUrl,
      );
    }
    for (const categoria of copia.categorias ?? []) {
      for (const producto of categoria.productos ?? []) {
        if (producto.imagenPrincipal) {
          producto.imagenPublica = await this.productoDataUrl(
            producto.imagenPrincipal,
          );
        }
      }
    }
    return copia;
  }

  private async cartaDataUrl(url: string) {
    if (/^data:/i.test(url) || /^https?:\/\//i.test(url)) return url;
    const match = url.match(/^\/media\/cartas\/(\d+)\/([^/]+)$/);
    if (!match) return null;
    const [, restauranteId, archivo] = match;
    const safe = basename(archivo);
    if (safe !== archivo) return null;
    const extension = safe.toLowerCase().split('.').pop();
    const mime =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    try {
      const data = await readFile(
        resolve(
          this.storageRoot(),
          `restaurante-${restauranteId}`,
          'cartas',
          safe,
        ),
      );
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private async productoDataUrl(imagen: {
    restauranteId: number;
    productoId: number;
    tokenPublico: string;
  }) {
    try {
      const data = await readFile(
        resolve(
          this.storageRoot(),
          `restaurante-${imagen.restauranteId}`,
          `producto-${imagen.productoId}`,
          imagen.tokenPublico,
          'thumb.webp',
        ),
      );
      return `data:image/webp;base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private storageRoot() {
    const configurado = process.env.MEDIA_STORAGE_DIR?.trim();
    return configurado
      ? isAbsolute(configurado)
        ? configurado
        : resolve(process.cwd(), configurado)
      : resolve(process.cwd(), 'storage', 'media');
  }

  private async sucursalEnAlcance(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        estado: true,
        ...(usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null
          ? {}
          : { restauranteId: usuario.restauranteId ?? -1 }),
        ...(usuario.sucursalId !== null ? { id: usuario.sucursalId } : {}),
      },
      select: { id: true },
    });
    if (!sucursal) throw new BadRequestException('Sucursal fuera de alcance');
  }

  private habilitadaPorEntorno() {
    return Boolean(
      this.baseUrlOpcional() && process.env.PUBLIC_MENU_PUBLISH_TOKEN?.trim(),
    );
  }

  private validarEntorno() {
    if (!this.habilitadaPorEntorno()) {
      throw new BadRequestException(
        'Menú público no configurado. Define PUBLIC_MENU_BASE_URL y PUBLIC_MENU_PUBLISH_TOKEN en EDGE.',
      );
    }
  }

  private baseUrl() {
    const url = this.baseUrlOpcional();
    if (!url)
      throw new BadRequestException('PUBLIC_MENU_BASE_URL no configurado');
    return url;
  }

  private baseUrlOpcional() {
    return process.env.PUBLIC_MENU_BASE_URL?.trim().replace(/\/$/, '') || null;
  }

  private mensaje(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Error desconocido';
    }
  }
}
