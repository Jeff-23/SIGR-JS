import { IsString, IsNotEmpty } from 'class-validator';

export class CreateMetodoPagoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}