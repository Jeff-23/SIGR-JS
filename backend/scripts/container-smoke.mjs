import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Sólo la base restaurada de certificación; nunca ejecuta migraciones ni seed.
const container = 'sigr-cert-smoke-20260828';
const database = new URL(process.env.DATABASE_URL);
database.hostname = 'host.docker.internal';
database.pathname = '/sigr_cert_restore_20260828';
const env = {
  ...process.env,
  DATABASE_URL: database.toString(),
  JWT_SECRET: randomBytes(48).toString('hex'),
  CORS_ORIGINS: 'https://frontend.example.invalid',
};
let created = false;
function docker(args) {
  const result = spawnSync('docker', args, { env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Docker falló en ${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
}
try {
  docker(['run', '--detach', '--name', container, '-p', '127.0.0.1:3301:3000',
    '-e', 'DATABASE_URL', '-e', 'JWT_SECRET', '-e', 'CORS_ORIGINS',
    '-e', 'NODE_ENV=production', 'sigr-backend:revision-sprints-23-31']);
  created = true;
  const user = docker(['inspect', '--format={{.Config.User}}', container]);
  if (!user || user === 'root' || user === '0') throw new Error('Contenedor con usuario root');
  let ready = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:3301/health/ready', { signal: AbortSignal.timeout(1500) });
      if (response.ok) { ready = true; break; }
    } catch { /* El proceso todavía puede estar iniciando. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) {
    const logs = spawnSync('docker', ['logs', '--tail', '30', container], { encoding: 'utf8' });
    const detail = `${logs.stdout}${logs.stderr}`.replaceAll(env.JWT_SECRET, '[redacted]').replaceAll(env.DATABASE_URL, '[redacted]');
    throw new Error(`Readiness no quedó saludable: ${detail}`);
  }
  console.log(`Smoke Docker aprobado: usuario ${user}, readiness PostgreSQL 200, base restaurada aislada.`);
} finally {
  if (created) {
    spawnSync('docker', ['stop', container], { encoding: 'utf8' });
    spawnSync('docker', ['rm', container], { encoding: 'utf8' });
  }
}
