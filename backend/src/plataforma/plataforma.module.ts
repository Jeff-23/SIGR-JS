import { Module } from '@nestjs/common';
import { EstadoController } from './estado.controller';
import { MetricasService } from './metricas.service';

@Module({
  controllers: [EstadoController],
  providers: [MetricasService],
  exports: [MetricasService],
})
export class PlataformaModule {}
