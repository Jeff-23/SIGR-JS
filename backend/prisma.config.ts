import "dotenv/config";
import { defineConfig } from '@prisma/config';

export default defineConfig({
  // 1. Agrega este bloque para habilitar el seed:
  migrations: {
    seed: 'npx ts-node prisma/seed.ts',
  },
  
  // 2. Mantén lo que ya tenías, por ejemplo:
  datasource: {
    url: process.env.DATABASE_URL,
  }
});