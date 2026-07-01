import { Module } from '@nestjs/common';
import { RestaurantesService } from './restaurantes.service';
import { RestaurantesController } from './restaurantes.controller';

@Module({
  providers: [RestaurantesService],
  controllers: [RestaurantesController]
})
export class RestaurantesModule {}
