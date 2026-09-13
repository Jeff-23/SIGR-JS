const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOST = process.env.SIGR_PRINT_AGENT_HOST || '127.0.0.1';
const PORT = Number(process.env.SIGR_PRINT_AGENT_PORT || 38475);
const SCRIPT = path.join(__dirname, 'windows-printer.ps1');
const MAX_BODY = 256 * 1024;

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-SIGR-Print-Agent');
  res.setHeader('Access-Control-Max-Age', '600');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function runPowerShell(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('El agente de impresión de SIGR requiere Windows'));
      return;
    }
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, ...args],
      {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('La operación con la impresora excedió el tiempo límite'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = stdout.trim();
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch { /* handled below */ }
      }
      if (code !== 0 && !parsed) {
        reject(new Error(stderr.trim() || text || `PowerShell terminó con código ${code}`));
        return;
      }
      resolve(parsed || { ok: code === 0, message: stderr.trim() || text });
    });
  });
}

async function listPrinters() {
  const result = await runPowerShell(['-Operation', 'list']);
  return Array.isArray(result) ? result : result ? [result] : [];
}

async function printerStatus(name) {
  return runPowerShell(['-Operation', 'status', '-PrinterName', name]);
}

async function printText({ printerName, jobName, content, widthMm }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sigr-print-'));
  const file = path.join(dir, 'ticket.txt');
  try {
    await fs.writeFile(file, content, 'utf8');
    return await runPowerShell(
      [
        '-Operation', 'print',
        '-PrinterName', printerName,
        '-FilePath', file,
        '-JobName', jobName,
        '-WidthMm', String(widthMm === 58 ? 58 : 80),
        '-TimeoutSeconds', '12',
      ],
      25000,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
      json(res, 403, { ok: false, error: 'Origen no permitido' });
      return;
    }
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
    json(res, 403, { ok: false, error: 'Origen no permitido' });
    return;
  }
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/v1/health') {
      json(res, 200, { ok: true, service: 'Agente de impresión de SIGR', version: '0.1.0', platform: process.platform });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/printers') {
      json(res, 200, { ok: true, printers: await listPrinters() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/print') {
      const body = await readJson(req);
      const printerName = String(body.printerName || '').trim();
      const content = String(body.content || '');
      const jobName = String(body.jobName || 'SIGR').trim().slice(0, 120) || 'SIGR';
      const widthMm = Number(body.widthMm) === 58 ? 58 : 80;
      if (!printerName || !content) {
        json(res, 400, { ok: false, status: 'invalid', error: 'Debes seleccionar una impresora y proporcionar el contenido a imprimir' });
        return;
      }
      const status = await printerStatus(printerName);
      if (!status?.available) {
        json(res, 409, {
          ok: false,
          status: 'offline',
          error: status?.message || 'La impresora no está disponible',
          printer: status,
        });
        return;
      }
      const result = await printText({ printerName, jobName, content, widthMm });
      const httpStatus = result?.ok && result?.status === 'completed' ? 200 : 409;
      json(res, httpStatus, result);
      return;
    }
    json(res, 404, { ok: false, error: 'Ruta no encontrada' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del agente';
    json(res, message === 'PAYLOAD_TOO_LARGE' ? 413 : 500, { ok: false, status: 'error', error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agente de impresión de SIGR listo en http://${HOST}:${PORT}`);
});
