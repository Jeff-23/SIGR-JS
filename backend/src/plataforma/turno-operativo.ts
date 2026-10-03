import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

type PerfilBasico = {
  id: number;
  nombre: string;
  predeterminada: boolean;
  modoActivacion: string;
  activoManual: boolean;
  horaInicio: string | null;
  horaFin: string | null;
  diasSemana: Prisma.JsonValue;
  plantilla: Prisma.JsonValue;
};

export type ContextoCartaOperativa = {
  turnoId: number | null;
  turnoNombre: string;
  perfilId: number | null;
  perfilNombre: string | null;
  productoIds: number[] | null;
  categoriaIds: number[] | null;
  fuente: 'TURNO_USUARIO' | 'ACTIVACION_CARTA' | 'PREDETERMINADA';
};

function valorPlantilla(plantilla: Prisma.JsonValue) {
  return plantilla && typeof plantilla === 'object' && !Array.isArray(plantilla)
    ? (plantilla as Record<string, unknown>)
    : {};
}

function productosDePerfil(plantilla: Prisma.JsonValue): number[] | null {
  const secciones = valorPlantilla(plantilla).secciones;
  if (!Array.isArray(secciones) || secciones.length === 0) return null;
  const ids = new Set<number>();
  for (const seccion of secciones) {
    if (!seccion || typeof seccion !== 'object' || Array.isArray(seccion)) continue;
    const productoIds = (seccion as Record<string, unknown>).productoIds;
    if (!Array.isArray(productoIds)) continue;
    for (const id of productoIds) {
      if (typeof id === 'number' && Number.isInteger(id) && id > 0) ids.add(id);
    }
  }
  return [...ids];
}

function perfilActivo(perfil: PerfilBasico, ahora: Date, zonaHoraria: string) {
  if (perfil.modoActivacion === 'SIEMPRE') return true;
  if (perfil.modoActivacion === 'MANUAL') return perfil.activoManual;
  if (perfil.modoActivacion !== 'HORARIO' || !perfil.horaInicio || !perfil.horaFin) return false;

  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dia = dias[valor('weekday')] ?? 1;
  const hora = `${valor('hour')}:${valor('minute')}`;
  const configurados = Array.isArray(perfil.diasSemana)
    ? perfil.diasSemana.filter((item): item is number => typeof item === 'number' && item >= 1 && item <= 7)
    : [1, 2, 3, 4, 5, 6, 7];

  if (perfil.horaInicio <= perfil.horaFin) {
    return configurados.includes(dia) && hora >= perfil.horaInicio && hora < perfil.horaFin;
  }
  if (hora >= perfil.horaInicio) return configurados.includes(dia);
  const diaAnterior = dia === 1 ? 7 : dia - 1;
  return hora < perfil.horaFin && configurados.includes(diaAnterior);
}

async function categoriasDePerfil(db: Db, perfilId: number) {
  const filas = await db.perfilCartaCategoria.findMany({
    where: { perfilCartaId: perfilId },
    select: { categoriaId: true },
  });
  return filas.map((fila) => fila.categoriaId);
}

async function categoriasDeTurno(db: Db, turnoId: number) {
  const filas = await db.categoriaTurnoOperativo.findMany({
    where: { turnoOperativoId: turnoId },
    select: { categoriaId: true },
  });
  return filas.map((fila) => fila.categoriaId);
}

async function contextoDesdePerfil(
  db: Db,
  perfil: PerfilBasico,
  fuente: ContextoCartaOperativa['fuente'],
): Promise<ContextoCartaOperativa> {
  const categoriaIds = await categoriasDePerfil(db, perfil.id);
  return {
    turnoId: null,
    turnoNombre: perfil.nombre,
    perfilId: perfil.id,
    perfilNombre: perfil.nombre,
    productoIds: productosDePerfil(perfil.plantilla),
    categoriaIds,
    fuente,
  };
}

export async function resolverContextoCartaOperativa(
  db: Db,
  sucursalId: number,
  usuarioId: number,
  ahora = new Date(),
): Promise<ContextoCartaOperativa | null> {
  const usuario = await db.usuario.findFirst({
    where: { id: usuarioId, activo: true, sucursalId },
    select: {
      turnoOperativoActivoId: true,
      turnosOperativos: { where: { turnoOperativo: { estado: true } }, select: { turnoOperativo: { select: { id: true, orden: true } } } },
    },
  });

  const permitidos = (usuario?.turnosOperativos ?? [])
    .map((item) => item.turnoOperativo)
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
    .map((item) => item.id);
  const turnoActivoId =
    usuario?.turnoOperativoActivoId && permitidos.includes(usuario.turnoOperativoActivoId)
      ? usuario.turnoOperativoActivoId
      : permitidos[0] ?? null;

  if (turnoActivoId !== null) {
    const turno = await db.turnoOperativo.findFirst({
      where: { id: turnoActivoId, sucursalId, estado: true },
      include: {
        perfilesCarta: {
          where: { perfilCarta: { estado: true } },
          include: { perfilCarta: true },
        },
      },
    });
    if (turno) {
      const perfiles = turno.perfilesCarta.map((item) => item.perfilCarta);
      const perfil = perfiles.find((item) => item.predeterminada) ?? perfiles[0] ?? null;
      const categoriaIds = await categoriasDeTurno(db, turno.id);
      return {
        turnoId: turno.id,
        turnoNombre: turno.nombre,
        perfilId: perfil?.id ?? null,
        perfilNombre: perfil?.nombre ?? null,
        productoIds: perfil ? productosDePerfil(perfil.plantilla) : null,
        categoriaIds: categoriaIds.length ? categoriaIds : perfil ? await categoriasDePerfil(db, perfil.id) : null,
        fuente: 'TURNO_USUARIO',
      };
    }
  }

  const sucursal = await db.sucursal.findUnique({
    where: { id: sucursalId },
    select: { restauranteId: true },
  });
  if (!sucursal) return null;

  const [zonaSucursal, zonaRestaurante, perfiles] = await Promise.all([
    db.configuracionSucursal.findUnique({
      where: { sucursalId_clave: { sucursalId, clave: 'ZONA_HORARIA' } },
      select: { valor: true },
    }),
    db.configuracionRestaurante.findUnique({
      where: { restauranteId_clave: { restauranteId: sucursal.restauranteId, clave: 'ZONA_HORARIA' } },
      select: { valor: true },
    }),
    db.perfilCarta.findMany({
      where: { sucursalId, estado: true },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const zonaHoraria =
    typeof zonaSucursal?.valor === 'string'
      ? zonaSucursal.valor
      : typeof zonaRestaurante?.valor === 'string'
        ? zonaRestaurante.valor
        : 'America/Bogota';
  const activo = perfiles.find((perfil) => perfilActivo(perfil, ahora, zonaHoraria));
  const elegido = activo ?? perfiles.find((perfil) => perfil.predeterminada) ?? perfiles[0];
  if (!elegido) return null;
  return contextoDesdePerfil(db, elegido, activo ? 'ACTIVACION_CARTA' : 'PREDETERMINADA');
}


export async function resolverContextoCartaPorSnapshot(
  db: Db,
  sucursalId: number,
  turnoOperativoId: number | null,
  perfilCartaId: number | null,
): Promise<ContextoCartaOperativa | null> {
  if (turnoOperativoId === null && perfilCartaId === null) return null;

  const turno = turnoOperativoId !== null
    ? await db.turnoOperativo.findFirst({
        where: { id: turnoOperativoId, sucursalId },
        select: { id: true, nombre: true },
      })
    : null;
  const perfil = perfilCartaId !== null
    ? await db.perfilCarta.findFirst({
        where: { id: perfilCartaId, sucursalId },
      })
    : null;
  if (!turno && !perfil) return null;

  const categoriaIds = turno
    ? await categoriasDeTurno(db, turno.id)
    : perfil
      ? await categoriasDePerfil(db, perfil.id)
      : null;
  return {
    turnoId: turno?.id ?? null,
    turnoNombre: turno?.nombre ?? perfil?.nombre ?? 'Operación',
    perfilId: perfil?.id ?? null,
    perfilNombre: perfil?.nombre ?? null,
    productoIds: perfil ? productosDePerfil(perfil.plantilla) : null,
    categoriaIds,
    fuente: turno ? 'TURNO_USUARIO' : 'PREDETERMINADA',
  };
}

export async function preciosPerfil(db: Db, perfilId: number, productoIds: number[]) {
  if (!productoIds.length) return new Map<number, Prisma.Decimal>();
  const filas = await db.productoPerfilCarta.findMany({
    where: { perfilCartaId: perfilId, productoId: { in: productoIds } },
    select: { productoId: true, precio: true },
  });
  return new Map(filas.map((fila) => [fila.productoId, fila.precio]));
}
