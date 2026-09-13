const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const files = [
  'server.js',
  'windows-printer.ps1',
  'install-startup.ps1',
  'uninstall-startup.ps1',
  'README.md',
  'package.json',
];
const mojibake = [/Ã./u, /Â./u, /â./u, /�/u];
let failed = false;
for (const relative of files) {
  const file = path.join(ROOT, relative);
  const buffer = fs.readFileSync(file);
  const text = buffer.toString('utf8');
  if (text.includes('\uFFFD')) {
    console.error(`${relative}: contiene caracteres UTF-8 inválidos o reemplazados`);
    failed = true;
  }
  if (mojibake.some((pattern) => pattern.test(text))) {
    console.error(`${relative}: posible texto mal decodificado (mojibake)`);
    failed = true;
  }
  if (relative.endsWith('.ps1')) {
    const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
    if (!hasBom) {
      console.error(`${relative}: debe guardarse como UTF-8 con BOM para Windows PowerShell 5.1`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log('Codificación UTF-8 validada correctamente.');
