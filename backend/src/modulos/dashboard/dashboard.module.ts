import { Module } from '@nestjs/common';

import { ReportesModule } from '../reportes/reportes.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ReportesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
