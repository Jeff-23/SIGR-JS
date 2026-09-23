import { IsString, MinLength } from 'class-validator';

export class DesactivarRestauranteDto {
  @IsString()
  @MinLength(6)
  password!: string;
}
