import {
  Controller,
  Get,
  Header,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricasService } from './metricas.service';
import { obtenerEntorno } from '../config/entorno';

@Controller('health')
export class EstadoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metricas: MetricasService,
  ) {}

  @Get('live')
  vida() {
    return {
      status: 'ok' as const,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  async disponibilidad() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' as const, database: 'available' as const };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricasPrometheus() {
    if (!obtenerEntorno().metricasHabilitadas) throw new NotFoundException();
    return this.metricas.exportar();
  }
}
