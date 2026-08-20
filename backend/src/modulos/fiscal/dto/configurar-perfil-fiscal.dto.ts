import { AmbienteDian, ModoOperacionDian } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class ConfigurarPerfilFiscalDto {
  @IsEnum(AmbienteDian)
  ambiente: AmbienteDian;

  @IsEnum(ModoOperacionDian)
  modoOperacion: ModoOperacionDian;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  proveedorCodigo?: string;

  @IsString()
  @MaxLength(20)
  responsabilidadFiscal: string;

  @Matches(/^\d{5}$/)
  municipioCodigo: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  actividadEconomica?: string;

  @Matches(/^secret:\/\/[a-zA-Z0-9/_-]+$/)
  @IsOptional()
  softwareIdRef?: string;

  @Matches(/^secret:\/\/[a-zA-Z0-9/_-]+$/)
  @IsOptional()
  credencialRef?: string;

  @Matches(/^secret:\/\/[a-zA-Z0-9/_-]+$/)
  @IsOptional()
  certificadoRef?: string;

  @IsBoolean()
  activo: boolean;
}
