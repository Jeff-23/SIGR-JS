import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serverDirectory = resolve(projectRoot, 'dist', 'server')

await mkdir(serverDirectory, { recursive: true })
await copyFile(
  resolve(projectRoot, 'sites-worker.mjs'),
  resolve(serverDirectory, 'index.js'),
)
