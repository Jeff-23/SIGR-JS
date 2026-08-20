import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config'; // Fuerza la lectura de tu archivo .env

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private destruido = false;

  constructor() {
    // 1. Configuramos el pool de conexiones usando tu DATABASE_URL
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // 2. Creamos el adaptador oficial de Postgres
    const adapter = new PrismaPg(pool);

    // 3. Inicializamos PrismaClient pasando el adaptador (¡Esto soluciona el error!)
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    if (this.destruido) return;
    this.destruido = true;
    await this.$disconnect();
    await this.pool.end();
  }
}
