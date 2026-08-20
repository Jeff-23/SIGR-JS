import { IsString, IsNotEmpty, IsInt, MaxLength } from 'class-validator';

export class CreateZonaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre: string;

  @IsInt()
  @IsNotEmpty()
  sucursalId: number;
}
