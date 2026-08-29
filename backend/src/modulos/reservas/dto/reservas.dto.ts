import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EstadoEspera, EstadoReserva } from '@prisma/client';

export class CrearReservaDto {
  @IsInt() @Min(1) sucursalId: number;
  @IsString() @MinLength(2) @MaxLength(160) nombreCliente: string;
  @IsString() @MinLength(5) @MaxLength(30) telefono: string;
  @IsOptional() @IsEmail() @MaxLength(150) correo?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) personas: number;
  @IsDateString() fechaHora: string;
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(480)
  @IsOptional()
  duracionMinutos?: number;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() mesaId?: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}

export class CambiarEstadoReservaDto {
  @IsEnum(EstadoReserva) estado: EstadoReserva;
}

export class SentarDto {
  @Type(() => Number) @IsInt() @Min(1) mesaId: number;
}

export class CrearEsperaDto {
  @IsInt() @Min(1) sucursalId: number;
  @IsString() @MinLength(2) @MaxLength(160) nombreCliente: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) personas: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}

export class CambiarEstadoEsperaDto {
  @IsEnum(EstadoEspera) estado: EstadoEspera;
}
