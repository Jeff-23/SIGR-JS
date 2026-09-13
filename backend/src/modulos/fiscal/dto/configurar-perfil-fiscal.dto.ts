import { AmbienteDian, ModoOperacionDian } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const REFERENCIA_SECRETA = /^secret:\/\/[a-zA-Z0-9/_-]+$/;

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

  @Matches(REFERENCIA_SECRETA)
  @IsOptional()
  softwareIdRef?: string;

  @Matches(REFERENCIA_SECRETA)
  @IsOptional()
  pinSoftwareRef?: string;

  @Matches(REFERENCIA_SECRETA)
  @IsOptional()
  credencialRef?: string;

  @Matches(REFERENCIA_SECRETA)
  @IsOptional()
  cuentaProveedorRef?: string;

  @Matches(REFERENCIA_SECRETA)
  @IsOptional()
  certificadoRef?: string;

  @IsBoolean()
  activo: boolean;
}
