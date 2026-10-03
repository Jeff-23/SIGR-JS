import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class ActualizarCierreDistribucionDto {
  @IsOptional()
  @IsBoolean()
  emailActivo?: boolean;

  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  emails!: string[];

  @IsOptional()
  @IsBoolean()
  whatsappActivo?: boolean;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(25, { each: true })
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    each: true,
    message:
      'Cada WhatsApp debe estar en formato internacional, por ejemplo +573001234567',
  })
  whatsapps!: string[];
}
