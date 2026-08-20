import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class EstadoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  vida() {
    return { status: 'ok' as const };
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
}
