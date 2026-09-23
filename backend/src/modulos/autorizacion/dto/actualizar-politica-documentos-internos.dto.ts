import { IsIn, IsString, Matches } from 'class-validator';

export class ActualizarPoliticaDocumentosInternosDto {
  @IsIn(['CONTROLADA', 'FLEXIBLE'])
  modo!: 'CONTROLADA' | 'FLEXIBLE';

  @IsString()
  password!: string;

  @IsString()
  @Matches(/^\d{6,12}$/, {
    message: 'pin debe contener entre 6 y 12 dígitos',
  })
  pin!: string;
}
