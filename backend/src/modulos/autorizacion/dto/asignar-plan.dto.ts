import { IsInt, Min } from 'class-validator';

export class AsignarPlanDto {
  @IsInt()
  @Min(1)
  planId!: number;
}
