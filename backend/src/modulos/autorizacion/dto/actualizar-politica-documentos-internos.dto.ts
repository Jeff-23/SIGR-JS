import { IsIn, IsString, Matches, MinLength } from 'class-validator';

export class ActualizarPoliticaDocumentosInternosDto {
  @IsIn(['CONTROLADA', 'FLEXIBLE'])
  modo!: 'CONTROLADA' | 'FLEXIBLE';

  @IsString()
  @MinLength(10)
  password!: string;

  @IsString()
  @Matches(/^\d{6,12}$/, {
    message: 'pin debe contener entre 6 y 12 dígitos',
  })
  pin!: string;
}
