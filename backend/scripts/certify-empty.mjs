import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
const database = new URL(process.env.DATABASE_URL);
database.pathname = '/sigr_cert_empty_20260828';
const env = { ...process.env, DATABASE_URL: database.toString(), SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex') };
function run(command) {
  const result = spawnSync(command, { shell: true, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Falló ${command}; revisar el entorno de certificación aislado.`);
  console.log(`${command}: aprobado`);
}
run('npx prisma migrate deploy');
run('npm run db:seed');
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const tables = ['Usuario', 'Rol', 'RolPermiso', 'Restaurante', 'Sucursal', 'Producto', 'Categoria', 'EstacionPreparacion'];
async function counts() {
  return Promise.all(tables.map(async name => Number((await pool.query(`SELECT count(*) AS n FROM "${name}"`)).rows[0].n)));
}
try {
  const before = await counts();
  run('npm run db:seed');
  const after = await counts();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('El segundo seed alteró la cantidad de registros');
  console.log('Migración desde cero y doble seed sin duplicados: aprobados. Base aislada sigr_cert_empty_20260828.');
} finally { await pool.end(); }
