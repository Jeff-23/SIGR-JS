import { spawnSync } from 'node:child_process';

const permitidas = new Set(['prisma', '@prisma/config', 'deepmerge-ts']);
const resultado =
  process.platform === 'win32'
    ? spawnSync(
        process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',
        ['/d', '/s', '/c', 'npm audit --omit=dev --json'],
        { encoding: 'utf8' },
      )
    : spawnSync('npm', ['audit', '--omit=dev', '--json'], {
        encoding: 'utf8',
      });

let informe;
try {
  informe = JSON.parse(resultado.stdout);
} catch {
  process.stderr.write(
    resultado.stderr ||
      resultado.stdout ||
      resultado.error?.message ||
      'Error desconocido de npm audit',
  );
  throw new Error('npm audit no devolvió un informe JSON válido');
}

const vulnerabilidades = Object.entries(informe.vulnerabilities ?? {});
const bloqueantes = vulnerabilidades.filter(
  ([nombre, dato]) =>
    ['high', 'critical'].includes(dato.severity) && !permitidas.has(nombre),
);
const criticas = vulnerabilidades.filter(
  ([, dato]) => dato.severity === 'critical',
);

if (criticas.length || bloqueantes.length) {
  process.stderr.write(
    `Auditoría bloqueada: ${[...criticas, ...bloqueantes]
      .map(([nombre, dato]) => `${nombre} (${dato.severity})`)
      .join(', ')}\n`,
  );
  process.exit(1);
}

const aceptadas = vulnerabilidades.filter(([nombre]) => permitidas.has(nombre));
process.stdout.write(
  aceptadas.length
    ? `Riesgo temporal controlado: ${aceptadas.map(([nombre]) => nombre).join(', ')}. Ver CERTIFICACION_BACKEND_V1.md.\n`
    : 'Auditoría de dependencias sin vulnerabilidades altas o críticas.\n',
);
