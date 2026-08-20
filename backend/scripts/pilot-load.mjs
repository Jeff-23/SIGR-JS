const argumentos = new Map();
for (let indice = 2; indice < process.argv.length; indice += 2) {
  argumentos.set(process.argv[indice], process.argv[indice + 1]);
}

const url = new URL(
  argumentos.get('--url') ?? 'http://127.0.0.1:3000/health/live',
);
const solicitudes = entero('--requests', 100, 1, 5000);
const concurrencia = entero('--concurrency', 10, 1, 100);
const p95MaximoMs = entero('--p95-ms', 1000, 1, 60000);
const timeoutMs = entero('--timeout-ms', 5000, 100, 60000);

if (!['http:', 'https:'].includes(url.protocol)) {
  throw new Error('La URL del piloto debe usar HTTP o HTTPS');
}

const latencias = [];
const errores = [];
let siguiente = 0;

async function trabajador() {
  while (true) {
    const numero = siguiente++;
    if (numero >= solicitudes) return;

    const inicio = performance.now();
    try {
      const respuesta = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      const cuerpo = await respuesta.text();
      if (!respuesta.ok) {
        errores.push({ numero: numero + 1, estado: respuesta.status });
      } else {
        try {
          const json = JSON.parse(cuerpo);
          if (json.status !== 'ok') {
            errores.push({ numero: numero + 1, estado: 'respuesta-invalida' });
          }
        } catch {
          errores.push({ numero: numero + 1, estado: 'json-invalido' });
        }
      }
    } catch (error) {
      errores.push({
        numero: numero + 1,
        estado: error instanceof Error ? error.name : 'error-desconocido',
      });
    } finally {
      latencias.push(performance.now() - inicio);
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrencia, solicitudes) }, trabajador),
);

latencias.sort((a, b) => a - b);
const percentil = (valor) =>
  latencias[Math.min(latencias.length - 1, Math.ceil(latencias.length * valor) - 1)];
const resultado = {
  url: url.toString(),
  solicitudes,
  concurrencia,
  exitosas: solicitudes - errores.length,
  errores: errores.length,
  latenciaMs: {
    p50: redondear(percentil(0.5)),
    p95: redondear(percentil(0.95)),
    p99: redondear(percentil(0.99)),
    maxima: redondear(latencias.at(-1)),
  },
  umbralP95Ms: p95MaximoMs,
};

console.log(JSON.stringify(resultado, null, 2));

if (errores.length > 0 || resultado.latenciaMs.p95 > p95MaximoMs) {
  console.error(
    `Piloto rechazado: ${errores.length} errores; p95 ${resultado.latenciaMs.p95} ms`,
  );
  process.exitCode = 1;
}

function entero(nombre, predeterminado, minimo, maximo) {
  const texto = argumentos.get(nombre);
  const valor = texto === undefined ? predeterminado : Number(texto);
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo}`);
  }
  return valor;
}

function redondear(valor) {
  return Math.round(valor * 100) / 100;
}
