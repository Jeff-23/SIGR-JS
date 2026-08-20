export type AmbienteAplicacion = 'development' | 'test' | 'production';
export type DuracionJwt = `${number}${'s' | 'm' | 'h' | 'd'}`;

export type ConfiguracionEntorno = {
  ambiente: AmbienteAplicacion;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiraEn: DuracionJwt;
  puerto: number;
  corsOrigenes: string[];
  throttleTtlMs: number;
  throttleLimite: number;
};

const AMBIENTES = new Set<AmbienteAplicacion>([
  'development',
  'test',
  'production',
]);

let configuracionCache: ConfiguracionEntorno | undefined;

export function validarEntorno(
  variables: NodeJS.ProcessEnv,
): ConfiguracionEntorno {
  const ambienteRecibido = variables.NODE_ENV ?? 'development';
  if (!AMBIENTES.has(ambienteRecibido as AmbienteAplicacion)) {
    throw new Error('NODE_ENV debe ser development, test o production');
  }
  const ambiente = ambienteRecibido as AmbienteAplicacion;
  const databaseUrl = requerida(variables, 'DATABASE_URL');
  validarDatabaseUrl(databaseUrl);

  const jwtSecret = requerida(variables, 'JWT_SECRET');
  const longitudMinima = ambiente === 'production' ? 32 : 16;
  if (jwtSecret.length < longitudMinima) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${longitudMinima} caracteres en ${ambiente}`,
    );
  }
  if (/^(secret|changeme|cambiar|password|123456)/i.test(jwtSecret)) {
    throw new Error('JWT_SECRET utiliza un valor inseguro o predeterminado');
  }

  const jwtExpiraEn = (variables.JWT_EXPIRES_IN?.trim() ||
    '12h') as DuracionJwt;
  if (!/^\d+(s|m|h|d)$/.test(jwtExpiraEn)) {
    throw new Error('JWT_EXPIRES_IN debe usar un formato como 30m, 12h o 7d');
  }

  const puerto = entero(variables.PORT, 3000, 'PORT', 1, 65535);
  const throttleTtlMs = entero(
    variables.THROTTLE_TTL_MS,
    60000,
    'THROTTLE_TTL_MS',
    1000,
    3600000,
  );
  const throttleLimite = entero(
    variables.THROTTLE_LIMIT,
    ambiente === 'production' ? 100 : 1000,
    'THROTTLE_LIMIT',
    1,
    100000,
  );

  const corsOrigenes = (variables.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
  if (corsOrigenes.length === 0) {
    throw new Error('CORS_ORIGINS debe contener al menos un origen');
  }
  for (const origen of corsOrigenes) {
    validarOrigenCors(origen, ambiente);
  }

  return {
    ambiente,
    databaseUrl,
    jwtSecret,
    jwtExpiraEn,
    puerto,
    corsOrigenes,
    throttleTtlMs,
    throttleLimite,
  };
}

export function obtenerEntorno(): ConfiguracionEntorno {
  configuracionCache ??= validarEntorno(process.env);
  return configuracionCache;
}

function requerida(variables: NodeJS.ProcessEnv, nombre: string): string {
  const valor = variables[nombre]?.trim();
  if (!valor) throw new Error(`La variable ${nombre} es obligatoria`);
  return valor;
}

function entero(
  valor: string | undefined,
  predeterminado: number,
  nombre: string,
  minimo: number,
  maximo: number,
): number {
  if (valor === undefined || valor.trim() === '') return predeterminado;
  if (!/^\d+$/.test(valor.trim())) {
    throw new Error(`${nombre} debe ser un número entero`);
  }
  const resultado = Number(valor);
  if (resultado < minimo || resultado > maximo) {
    throw new Error(`${nombre} debe estar entre ${minimo} y ${maximo}`);
  }
  return resultado;
}

function validarDatabaseUrl(valor: string) {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error('DATABASE_URL debe ser una URL válida');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL debe utilizar PostgreSQL');
  }
}

function validarOrigenCors(origen: string, ambiente: AmbienteAplicacion) {
  if (origen === '*') {
    throw new Error('CORS_ORIGINS no permite el comodín * con credenciales');
  }
  let url: URL;
  try {
    url = new URL(origen);
  } catch {
    throw new Error(`Origen CORS inválido: ${origen}`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origen) {
    throw new Error(`Origen CORS inválido: ${origen}`);
  }
  if (ambiente === 'production' && url.protocol !== 'https:') {
    throw new Error('Los orígenes CORS de producción deben usar HTTPS');
  }
}
