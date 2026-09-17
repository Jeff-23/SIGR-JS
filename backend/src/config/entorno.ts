export type AmbienteAplicacion = 'development' | 'test' | 'production';
export type DuracionJwt = `${number}${'s' | 'm' | 'h' | 'd'}`;
export type RolSync = 'EDGE' | 'CLOUD' | 'STANDALONE';

export type ConfiguracionEntorno = {
  ambiente: AmbienteAplicacion;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiraEn: DuracionJwt;
  puerto: number;
  corsOrigenes: string[];
  throttleTtlMs: number;
  throttleLimite: number;
  zonaHoraria: string;
  swaggerHabilitado: boolean;
  metricasHabilitadas: boolean;
  confianzaProxy: boolean;
  syncHabilitado: boolean;
  syncRol: RolSync;
  syncNodeId: string;
  syncPeerUrl?: string;
  syncPeerNodeId?: string;
  syncPeerKey?: string;
  syncPollIntervalMs: number;
  syncBatchSize: number;
  syncCertificationEnabled: boolean;
  syncCertKey?: string;
  syncBootstrapPeerNodeId?: string;
  syncBootstrapPeerKey?: string;
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
  const zonaHoraria = variables.TIME_ZONE?.trim() || 'America/Bogota';
  validarZonaHoraria(zonaHoraria);
  const swaggerHabilitado = booleano(
    variables.SWAGGER_ENABLED,
    ambiente !== 'production',
    'SWAGGER_ENABLED',
  );
  const metricasHabilitadas = booleano(
    variables.METRICS_ENABLED,
    true,
    'METRICS_ENABLED',
  );
  const confianzaProxy = booleano(variables.TRUST_PROXY, false, 'TRUST_PROXY');

  const syncHabilitado = booleano(
    variables.SYNC_ENABLED,
    false,
    'SYNC_ENABLED',
  );
  const syncRolRecibido =
    variables.SYNC_ROLE?.trim().toUpperCase() || 'STANDALONE';
  if (!['EDGE', 'CLOUD', 'STANDALONE'].includes(syncRolRecibido)) {
    throw new Error('SYNC_ROLE debe ser EDGE, CLOUD o STANDALONE');
  }
  const syncRol = syncRolRecibido as RolSync;
  const syncNodeId = variables.SYNC_NODE_ID?.trim() || 'standalone';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(syncNodeId)) {
    throw new Error('SYNC_NODE_ID debe tener 3-120 caracteres seguros');
  }
  const syncPeerUrl = opcional(variables, 'SYNC_PEER_URL');
  const syncPeerNodeId = opcional(variables, 'SYNC_PEER_NODE_ID');
  const syncPeerKey = opcional(variables, 'SYNC_PEER_KEY');
  const syncPollIntervalMs = entero(
    variables.SYNC_POLL_INTERVAL_MS,
    5000,
    'SYNC_POLL_INTERVAL_MS',
    1000,
    300000,
  );
  const syncBatchSize = entero(
    variables.SYNC_BATCH_SIZE,
    50,
    'SYNC_BATCH_SIZE',
    1,
    200,
  );
  const syncCertificationEnabled = booleano(
    variables.SYNC_CERTIFICATION_ENABLED,
    false,
    'SYNC_CERTIFICATION_ENABLED',
  );
  const syncCertKey = opcional(variables, 'SYNC_CERT_KEY');
  const syncBootstrapPeerNodeId = opcional(
    variables,
    'SYNC_BOOTSTRAP_PEER_NODE_ID',
  );
  const syncBootstrapPeerKey = opcional(variables, 'SYNC_BOOTSTRAP_PEER_KEY');

  if (syncHabilitado && syncRol === 'STANDALONE') {
    throw new Error('SYNC_ROLE debe ser EDGE o CLOUD cuando SYNC_ENABLED=true');
  }
  if (syncHabilitado && syncRol === 'EDGE') {
    if (!syncPeerUrl || !syncPeerNodeId || !syncPeerKey) {
      throw new Error(
        'EDGE requiere SYNC_PEER_URL, SYNC_PEER_NODE_ID y SYNC_PEER_KEY',
      );
    }
    validarSyncUrl(syncPeerUrl, ambiente);
    validarClaveSync(syncPeerKey, 'SYNC_PEER_KEY');
  }
  if (syncCertificationEnabled) {
    if (!syncCertKey)
      throw new Error('SYNC_CERT_KEY es obligatoria para certificacion sync');
    validarClaveSync(syncCertKey, 'SYNC_CERT_KEY');
  }
  if (syncBootstrapPeerKey)
    validarClaveSync(syncBootstrapPeerKey, 'SYNC_BOOTSTRAP_PEER_KEY');

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
    zonaHoraria,
    swaggerHabilitado,
    metricasHabilitadas,
    confianzaProxy,
    syncHabilitado,
    syncRol,
    syncNodeId,
    syncPeerUrl,
    syncPeerNodeId,
    syncPeerKey,
    syncPollIntervalMs,
    syncBatchSize,
    syncCertificationEnabled,
    syncCertKey,
    syncBootstrapPeerNodeId,
    syncBootstrapPeerKey,
  };
}

function booleano(
  valor: string | undefined,
  predeterminado: boolean,
  nombre: string,
): boolean {
  if (valor === undefined || valor.trim() === '') return predeterminado;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new Error(`${nombre} debe ser true o false`);
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

function opcional(
  variables: NodeJS.ProcessEnv,
  nombre: string,
): string | undefined {
  const valor = variables[nombre]?.trim();
  return valor || undefined;
}

function validarClaveSync(valor: string, nombre: string) {
  if (valor.length < 32)
    throw new Error(`${nombre} debe tener al menos 32 caracteres`);
}

function validarSyncUrl(valor: string, ambiente: AmbienteAplicacion) {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error('SYNC_PEER_URL debe ser una URL valida');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('SYNC_PEER_URL debe usar http o https');
  // En produccion EDGE real debe hablar con Cloud por TLS. Se permite HTTP solo
  // hacia host.docker.internal para la certificacion local 48D.
  if (
    ambiente === 'production' &&
    url.protocol !== 'https:' &&
    url.hostname !== 'host.docker.internal'
  ) {
    throw new Error('SYNC_PEER_URL de produccion debe usar HTTPS');
  }
}

function validarZonaHoraria(zonaHoraria: string) {
  try {
    new Intl.DateTimeFormat('es-CO', { timeZone: zonaHoraria }).format();
  } catch {
    throw new Error('TIME_ZONE debe ser una zona horaria IANA válida');
  }
}
