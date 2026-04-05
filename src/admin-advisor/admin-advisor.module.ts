import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UrbanexPrismaModule } from '../prisma/urbanex-prisma.module';
import { AdminAdvisorController } from './admin-advisor.controller';
import { AdminAdvisorService } from './admin-advisor.service';

@Module({
  imports: [AuthModule, UrbanexPrismaModule],
  controllers: [AdminAdvisorController],
  providers: [AdminAdvisorService, RolesGuard],
})
export class AdminAdvisorModule {}
