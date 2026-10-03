import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import type { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncBusinessService } from '../sync/sync-business.service';
import {
  generarPdfSimple,
  generarXlsx,
  type CierreTurnoSnapshot,
} from '../cajas/cierre-turno-reportes';
import type { ActualizarCierreDistribucionDto } from './dto/actualizar-cierre-distribucion.dto';
import { HttpWhatsAppCierreProvider } from './proveedores/http-whatsapp-cierre.provider';
import { SmtpCierreEmailProvider } from './proveedores/smtp-cierre-email.provider';

const CLAVES = {
  emailActivo: 'CIERRE_ENVIO_EMAIL_ACTIVO',
  emails: 'CIERRE_ENVIO_EMAIL_DESTINOS',
  whatsappActivo: 'CIERRE_ENVIO_WHATSAPP_ACTIVO',
  whatsapps: 'CIERRE_ENVIO_WHATSAPP_DESTINOS',
} as const;

type Canal = 'EMAIL' | 'WHATSAPP';
type Estado =
  | 'PENDIENTE'
  | 'ENVIANDO'
  | 'ENVIADO'
  | 'ERROR'
  | 'PENDIENTE_CONFIGURACION';

type ConfiguracionDistribucion = {
  emailActivo: boolean;
  emails: string[];
  whatsappActivo: boolean;
  whatsapps: string[];
  proveedores: {
    emailConfigurado: boolean;
    whatsappConfigurado: boolean;
  };
};

type EnvioListado = {
  id: number;
  cajaId: number;
  canal: Canal;
  destino: string;
  estado: Estado;
  intentos: number;
  creadoEn: Date;
  ultimoIntentoEn: Date | null;
  enviadoEn: Date | null;
  errorCodigo: string | null;
  errorMensaje: string | null;
};

type EnvioTrabajo = {
  id: number;
  intentos: number;
  canal: Canal;
  destino: string;
  preCierreHash: string;
  cajaId: number;
  cajaNombre: string;
  snapshot: unknown;
  cajaHash: string | null;
  sucursalNombre: string;
  restauranteNombre: string;
  razonSocial: string | null;
};

function separarDestinos(value: unknown) {
  if (typeof value !== 'string') return [];
  return [
    ...new Set(
      value
        .split(/[;,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function extraerCodigo(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return 'ENVIO_ERROR';
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : 'ENVIO_ERROR';
}

function errorSanitizado(error: unknown) {
  const code = extraerCodigo(error);
  const message =
    error instanceof Error ? error.message : 'No fue posible enviar el reporte';
  return {
    code: code.slice(0, 80),
    message: message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 300),
  };
}

@Injectable()
export class CierreDistribucionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CierreDistribucionService.name);
  private timer?: NodeJS.Timeout;
  private procesando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncBusinessService,
    private readonly email: SmtpCierreEmailProvider,
    private readonly whatsapp: HttpWhatsAppCierreProvider,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.procesarPendientes(), 30_000);
    this.timer.unref();
    setTimeout(() => void this.procesarPendientes(), 3_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async obtenerConfiguracion(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.validarSucursal(sucursalId, usuario);
    return this.leerConfiguracion(sucursalId);
  }

  async actualizarConfiguracion(
    sucursalId: number,
    data: ActualizarCierreDistribucionDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.validarSucursal(sucursalId, usuario);
    if (!usuario.permisos.includes('CONFIGURACION_GESTIONAR')) {
      throw new ForbiddenException(
        'No tienes permiso para administrar esta configuración',
      );
    }

    const emails = [
      ...new Set(data.emails.map((value) => value.trim().toLowerCase())),
    ];
    const whatsapps = [...new Set(data.whatsapps.map((value) => value.trim()))];
    // La activación es implícita: configurar al menos un destino basta.
    // El restaurante nunca administra credenciales ni proveedores técnicos.
    const emailActivo = emails.length > 0;
    const whatsappActivo = whatsapps.length > 0;

    await this.prisma.transaccionSerializable(async (tx) => {
      const valores: Array<[string, Prisma.InputJsonValue]> = [
        [CLAVES.emailActivo, emailActivo],
        [CLAVES.emails, emails.join(';')],
        [CLAVES.whatsappActivo, whatsappActivo],
        [CLAVES.whatsapps, whatsapps.join(';')],
      ];
      for (const [clave, valor] of valores) {
        const item = await tx.configuracionSucursal.upsert({
          where: { sucursalId_clave: { sucursalId, clave } },
          update: { valor },
          create: { sucursalId, clave, valor },
        });
        await this.sync.encolarConfiguracionSucursal(tx, item.id);
      }
    });
    return this.leerConfiguracion(sucursalId);
  }

  async listarEnvios(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.validarSucursal(sucursalId, usuario);
    return this.prisma.$queryRaw<EnvioListado[]>(Prisma.sql`
      SELECT
        "id", "cajaId", "canal"::text AS "canal", "destino",
        "estado"::text AS "estado", "intentos", "creadoEn",
        "ultimoIntentoEn", "enviadoEn", "errorCodigo", "errorMensaje"
      FROM "EnvioReporteCierre"
      WHERE "sucursalId" = ${sucursalId}
      ORDER BY "creadoEn" DESC
      LIMIT 50
    `);
  }

  async encolarDesdeCaja(cajaId: number) {
    const caja = await this.prisma.caja.findUnique({
      where: { id: cajaId },
      select: {
        id: true,
        sucursalId: true,
        preCierreHash: true,
        preCierreSnapshot: true,
        sucursal: { select: { restauranteId: true } },
      },
    });
    if (!caja?.preCierreHash || !caja.preCierreSnapshot) return;
    const config = await this.leerConfiguracion(caja.sucursalId);
    const destinos: Array<{ canal: Canal; destino: string }> = [];
    if (config.emailActivo) {
      destinos.push(
        ...config.emails.map((destino) => ({
          canal: 'EMAIL' as const,
          destino,
        })),
      );
    }
    if (config.whatsappActivo) {
      destinos.push(
        ...config.whatsapps.map((destino) => ({
          canal: 'WHATSAPP' as const,
          destino,
        })),
      );
    }
    if (!destinos.length) return;

    for (const item of destinos) {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "EnvioReporteCierre" (
          "globalId", "canal", "destino", "estado", "intentos",
          "preCierreHash", "creadoEn", "actualizadoEn",
          "cajaId", "sucursalId", "restauranteId"
        ) VALUES (
          ${randomUUID()}::uuid,
          CAST(${item.canal} AS "CanalEnvioReporteCierre"),
          ${item.destino}, 'PENDIENTE', 0, ${caja.preCierreHash}, NOW(), NOW(),
          ${cajaId}, ${caja.sucursalId}, ${caja.sucursal.restauranteId}
        )
        ON CONFLICT ("cajaId", "canal", "destino", "preCierreHash") DO NOTHING
      `);
    }
    void this.procesarPendientes();
  }

  async procesarPendientes() {
    if (this.procesando) return;
    this.procesando = true;
    try {
      const items = await this.prisma.$queryRaw<
        Array<{ id: number }>
      >(Prisma.sql`
        SELECT "id"
        FROM "EnvioReporteCierre"
        WHERE "estado" IN ('PENDIENTE', 'ERROR', 'PENDIENTE_CONFIGURACION')
          AND ("proximoIntentoEn" IS NULL OR "proximoIntentoEn" <= NOW())
        ORDER BY "creadoEn" ASC
        LIMIT 10
      `);
      for (const item of items) await this.procesarUno(item.id);
    } catch (error) {
      this.logger.warn(
        `No fue posible procesar la cola de reportes: ${errorSanitizado(error).message}`,
      );
    } finally {
      this.procesando = false;
    }
  }

  private async procesarUno(id: number) {
    const claimed = await this.prisma.$queryRaw<
      Array<{ id: number; intentos: number }>
    >(Prisma.sql`
      UPDATE "EnvioReporteCierre"
      SET "estado" = 'ENVIANDO',
          "ultimoIntentoEn" = NOW(),
          "intentos" = "intentos" + 1,
          "actualizadoEn" = NOW()
      WHERE "id" = ${id}
        AND "estado" IN ('PENDIENTE', 'ERROR', 'PENDIENTE_CONFIGURACION')
      RETURNING "id", "intentos"
    `);
    if (claimed.length !== 1) return;

    const rows = await this.prisma.$queryRaw<EnvioTrabajo[]>(Prisma.sql`
      SELECT
        e."id", e."intentos", e."canal"::text AS "canal", e."destino",
        e."preCierreHash", e."cajaId",
        c."nombre" AS "cajaNombre", c."preCierreSnapshot" AS "snapshot",
        c."preCierreHash" AS "cajaHash",
        s."nombre" AS "sucursalNombre",
        r."nombre" AS "restauranteNombre", r."razonSocial"
      FROM "EnvioReporteCierre" e
      JOIN "Caja" c ON c."id" = e."cajaId"
      JOIN "Sucursal" s ON s."id" = e."sucursalId"
      JOIN "Restaurante" r ON r."id" = e."restauranteId"
      WHERE e."id" = ${id}
      LIMIT 1
    `);
    const envio = rows[0];
    if (!envio) return;
    const snapshot = envio.snapshot as CierreTurnoSnapshot | null;
    if (!snapshot || envio.cajaHash !== envio.preCierreHash) {
      await this.fallar(
        envio.id,
        envio.intentos,
        'REPORTE_NO_DISPONIBLE',
        'El reporte ya no coincide con la fotografía preparada',
        false,
      );
      return;
    }

    const restaurant = envio.razonSocial || envio.restauranteNombre;
    const date = new Date().toISOString().slice(0, 10);
    const baseName = `Reporte_Cierre_${this.seguroNombre(envio.restauranteNombre)}_${this.seguroNombre(envio.sucursalNombre)}_${date}`;
    const message = {
      destino: envio.destino,
      asunto: `Reporte de cierre - ${restaurant} - ${envio.sucursalNombre}`,
      texto: `Se adjunta el reporte de cierre de ${restaurant}, sede ${envio.sucursalNombre}, caja ${envio.cajaNombre}.`,
      archivos: [
        {
          nombre: `${baseName}.pdf`,
          mime: 'application/pdf',
          contenido: generarPdfSimple(snapshot),
        },
        {
          nombre: `${baseName}.xlsx`,
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          contenido: generarXlsx(snapshot),
        },
      ],
    };

    const provider = envio.canal === 'EMAIL' ? this.email : this.whatsapp;
    if (!provider.disponible()) {
      await this.fallar(
        envio.id,
        envio.intentos,
        'PROVEEDOR_NO_CONFIGURADO',
        `${envio.canal} pendiente de configuración del proveedor`,
        true,
      );
      return;
    }
    try {
      await provider.enviar(message);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "EnvioReporteCierre"
        SET "estado" = 'ENVIADO', "enviadoEn" = NOW(),
            "proximoIntentoEn" = NULL, "errorCodigo" = NULL,
            "errorMensaje" = NULL, "actualizadoEn" = NOW()
        WHERE "id" = ${envio.id}
      `);
    } catch (error) {
      const safe = errorSanitizado(error);
      await this.fallar(
        envio.id,
        envio.intentos,
        safe.code,
        safe.message,
        safe.code === 'PROVEEDOR_NO_CONFIGURADO',
      );
    }
  }

  private async fallar(
    id: number,
    intentos: number,
    code: string,
    message: string,
    configuracion: boolean,
  ) {
    const minutes = configuracion
      ? 10
      : Math.min(60, Math.max(1, 2 ** Math.min(intentos, 5)));
    const estado: Estado = configuracion ? 'PENDIENTE_CONFIGURACION' : 'ERROR';
    const proximoIntento = new Date(Date.now() + minutes * 60_000);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "EnvioReporteCierre"
      SET "estado" = CAST(${estado} AS "EstadoEnvioReporteCierre"),
          "errorCodigo" = ${code}, "errorMensaje" = ${message},
          "proximoIntentoEn" = ${proximoIntento}, "actualizadoEn" = NOW()
      WHERE "id" = ${id}
    `);
  }

  private async leerConfiguracion(
    sucursalId: number,
  ): Promise<ConfiguracionDistribucion> {
    const sucursal = await this.prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: {
        restauranteId: true,
        configuraciones: {
          where: { clave: { in: Object.values(CLAVES) } },
        },
        restaurante: {
          select: {
            configuraciones: {
              where: { clave: { in: Object.values(CLAVES) } },
            },
          },
        },
      },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    const values = new Map<string, unknown>();
    for (const item of sucursal.restaurante.configuraciones) {
      values.set(item.clave, item.valor);
    }
    for (const item of sucursal.configuraciones) {
      values.set(item.clave, item.valor);
    }
    return {
      emailActivo: values.get(CLAVES.emailActivo) === true,
      emails: separarDestinos(values.get(CLAVES.emails)),
      whatsappActivo: values.get(CLAVES.whatsappActivo) === true,
      whatsapps: separarDestinos(values.get(CLAVES.whatsapps)),
      proveedores: {
        emailConfigurado: this.email.disponible(),
        whatsappConfigurado: this.whatsapp.disponible(),
      },
    };
  }

  private async validarSucursal(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    if (usuario.restauranteId === null) {
      throw new ForbiddenException(
        'Selecciona un restaurante para administrar la distribución',
      );
    }
    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        restauranteId: usuario.restauranteId,
        estado: true,
      },
      select: { id: true },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    if (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId) {
      throw new ForbiddenException(
        'La sucursal no pertenece al alcance del usuario',
      );
    }
  }

  private seguroNombre(value: string) {
    return (
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'SIGR'
    );
  }
}
