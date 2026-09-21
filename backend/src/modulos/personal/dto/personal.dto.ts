import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SucursalPersonalDto {
  @Type(() => Number) @IsInt() @Min(1) sucursalId: number;
}
export class CrearEmpleadoDto extends SucursalPersonalDto {
  @IsString() @MaxLength(30) codigo: string;
  @IsString() @MaxLength(100) nombres: string;
  @IsString() @MaxLength(100) apellidos: string;
  @IsOptional() @IsString() @MaxLength(40) documento?: string;
  @IsString() @MaxLength(80) cargo: string;
  @IsOptional() @IsInt() @Min(1) usuarioId?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) unidadOperativaIds?: number[];
}

export class RetirarEmpleadoDto {
  @IsString() @MaxLength(500) motivo: string;
  @IsOptional() @IsBoolean() desactivarUsuario?: boolean;
}

export class CrearUnidadOperativaDto extends SucursalPersonalDto {
  @IsString() @MaxLength(100) nombre: string;
  @IsOptional() @IsString() @MaxLength(220) descripcion?: string;
  @IsOptional() @IsInt() @Min(0) @Max(999) orden?: number;
}
export class AsignarUnidadesOperativasDto {
  @IsArray() @IsInt({ each: true }) unidadOperativaIds: number[];
}
export class CrearFuncionDto {
  @IsString() @MaxLength(80) nombre: string;
  @IsOptional() @IsString() @MaxLength(250) descripcion?: string;
}
export class AsignarFuncionesDto {
  @IsArray() @IsInt({ each: true }) funcionIds: number[];
}
export class CrearHorarioDto {
  @IsInt() @Min(0) @Max(6) diaSemana: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) horaInicio: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) horaFin: string;
}
export class ProgramarTurnoDto extends SucursalPersonalDto {
  @IsInt() @Min(1) empleadoId: number;
  @Type(() => Date) @IsDate() inicioProgramado: Date;
  @Type(() => Date) @IsDate() finProgramado: Date;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
  @IsOptional() @IsString() @MaxLength(60) etiqueta?: string;
  @IsOptional() @IsInt() @Min(0) @Max(480) minutosPausa?: number;
  @IsOptional() @IsInt() @Min(1) unidadOperativaId?: number;
}

export class TurnoSemanaItemDto {
  @Type(() => Date) @IsDate() inicioProgramado: Date;
  @Type(() => Date) @IsDate() finProgramado: Date;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
  @IsOptional() @IsString() @MaxLength(60) etiqueta?: string;
  @IsOptional() @IsInt() @Min(0) @Max(480) minutosPausa?: number;
  @IsOptional() @IsInt() @Min(1) unidadOperativaId?: number;
}
export class ProgramarSemanaDto extends SucursalPersonalDto {
  @IsInt() @Min(1) empleadoId: number;
  @IsOptional() @IsInt() @Min(1) unidadOperativaId?: number;
  @Type(() => Date) @IsDate() semanaInicio: Date;
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => TurnoSemanaItemDto)
  turnos: TurnoSemanaItemDto[];
}
export class CancelarTurnoDto {
  @IsString() @MaxLength(300) motivo: string;
}

export class MarcacionDto {
  @IsOptional() @IsString() @MaxLength(250) observaciones?: string;
}
export class CrearNovedadDto {
  @IsInt() @Min(1) empleadoId: number;
  @IsOptional() @IsInt() @Min(1) turnoId?: number;
  @IsString() @MaxLength(60) tipo: string;
  @IsString() @MaxLength(500) descripcion: string;
}
export class FiltroProductividadDto extends SucursalPersonalDto {
  @Type(() => Date) @IsDate() desde: Date;
  @Type(() => Date) @IsDate() hasta: Date;
}
