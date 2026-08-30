import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PersonalController } from './personal.controller';
import { PersonalService } from './personal.service';
@Module({
  imports: [PrismaModule],
  controllers: [PersonalController],
  providers: [PersonalService],
})
export class PersonalModule {}
