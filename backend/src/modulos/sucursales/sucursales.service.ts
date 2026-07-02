import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';

@Injectable()
export class SucursalesService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateSucursalDto) {
    // Validamos primero que el restaurante exista para evitar errores de clave foránea huérfana
    const restauranteExiste = await this.prisma.restaurante.findUnique({
      where: { id: data.restauranteId },
    });
    
    if (!restauranteExiste) {
      throw new NotFoundException(`El restaurante con ID ${data.restauranteId} no existe.`);
    }

    return this.prisma.sucursal.create({ data });
  }

  async findAll() {
    return this.prisma.sucursal.findMany({ 
      where: { estado: true } 
    });
  }

  async findOne(id: number) {
    const sucursal = await this.prisma.sucursal.findFirst({ 
      where: { id, estado: true } 
    });
    if (!sucursal) throw new NotFoundException(`Sucursal con ID ${id} no encontrada`);
    return sucursal;
  }

  async update(id: number, data: UpdateSucursalDto) {
    await this.findOne(id); // Valida que exista y esté activa
    return this.prisma.sucursal.update({ where: { id }, data });
  }

  async remove(id: number) {
    await this.findOne(id);
    // Borrado lógico usando la columna 'estado' del esquema
    return this.prisma.sucursal.update({ 
      where: { id }, 
      data: { estado: false } 
    });
  }
}