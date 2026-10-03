import { Module } from '@nestjs/common';
import { TurnosOperativosController } from './turnos-operativos.controller';
import { TurnosOperativosService } from './turnos-operativos.service';

@Module({ controllers: [TurnosOperativosController], providers: [TurnosOperativosService] })
export class TurnosOperativosModule {}
