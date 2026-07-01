import { Injectable } from '@nestjs/common';
import { CreateRestauranteDto } from './dto/create-restaurante.dto';
import { UpdateRestauranteDto } from './dto/update-restaurante.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RestaurantesService {
  constructor(private prisma: PrismaService) {}

  create(createRestauranteDto: CreateRestauranteDto) {
    return this.prisma.restaurante.create({
      data: createRestauranteDto,
    });
  }

  findAll() {
    // Solo traemos los restaurantes que están activos
    return this.prisma.restaurante.findMany({
      where: { estado: true }
    });
  }

  findOne(id: number) {
    // Traemos el restaurante y cruzamos la data con sus sucursales reales
    return this.prisma.restaurante.findUnique({
      where: { id },
      include: { sucursales: true }, 
    });
  }

  update(id: number, updateRestauranteDto: UpdateRestauranteDto) {
    return this.prisma.restaurante.update({
      where: { id },
      data: updateRestauranteDto,
    });
  }

  remove(id: number) {
    // Aplicamos Borrado Lógico: nunca eliminamos la data financiera, solo ocultamos el restaurante
    return this.prisma.restaurante.update({
      where: { id },
      data: { estado: false },
    });
  }
}