import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [AuthModule],
  providers: [OpsService, RolesGuard],
  controllers: [OpsController],
  exports: [OpsService],
})
export class OpsModule {}
