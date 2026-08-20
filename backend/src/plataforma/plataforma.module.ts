import { Module } from '@nestjs/common';
import { EstadoController } from './estado.controller';

@Module({ controllers: [EstadoController] })
export class PlataformaModule {}
