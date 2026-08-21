import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve, sep } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(projectRoot, "dist");
const serverDirectory = resolve(projectRoot, "dist", "server");

await mkdir(serverDirectory, { recursive: true });

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const path = relative(distDirectory, absolute).split(sep).join("/");
    if (
      path === "server" ||
      path.startsWith("server/") ||
      path === ".openai" ||
      path.startsWith(".openai/")
    )
      continue;
    if (entry.isDirectory()) files.push(...(await collect(absolute)));
    else
      files.push({
        path: `/${path}`,
        body: (await readFile(absolute)).toString("base64"),
      });
  }
  return files;
}

const assets = Object.fromEntries(
  (await collect(distDirectory)).map((file) => [file.path, file.body]),
);
const worker = `const ASSETS = ${JSON.stringify(assets)};
const TYPES = {'.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json; charset=utf-8'};
function response(path, method) {
  const encoded = ASSETS[path];
  if (!encoded) return null;
  const extension = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const headers = {'Content-Type': TYPES[extension] ?? 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'};
  return new Response(method === 'HEAD' ? null : bytes, { status: 200, headers });
}
export default { async fetch(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
  const path = decodeURIComponent(new URL(request.url).pathname);
  const exact = response(path === '/' ? '/index.html' : path, request.method);
  if (exact) return exact;
  if (request.headers.get('accept')?.includes('text/html')) return response('/index.html', request.method);
  return new Response('Not Found', { status: 404 });
}};
`;
const workerPath = resolve(serverDirectory, "index.js");
await writeFile(workerPath, worker);

const builtWorker = await import(
  `${new URL(`file:///${workerPath.replaceAll("\\", "/")}`).href}?build=${Date.now()}`
);
const smoke = await builtWorker.default.fetch(
  new Request("http://localhost/", { headers: { accept: "text/html" } }),
);
const html = await smoke.text();
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
const assetSmoke = scriptPath
  ? await builtWorker.default.fetch(
      new Request(`http://localhost${scriptPath}`),
    )
  : null;
if (
  smoke.status !== 200 ||
  !html.includes('<div id="root">') ||
  assetSmoke?.status !== 200
) {
  throw new Error(
    "El Worker de Sites no puede servir la aplicación en la ruta raíz",
  );
}
