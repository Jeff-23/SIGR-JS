import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginacionDto } from '../../../plataforma/paginacion';

export class ListarClientesDto extends PaginacionDto {
  @IsString()
  @IsOptional()
  buscar?: string;

  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === true || value === 'true') {
      return true;
    }

    if (value === false || value === 'false') {
      return false;
    }

    return value;
  })
  @IsBoolean()
  @IsOptional()
  estado?: boolean;
}
