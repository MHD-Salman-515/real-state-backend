import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OpsService } from './ops.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/ops/properties')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('queue')
  getQueue() {
    return this.opsService.listQueue();
  }

  @Post(':id/regen-images')
  regenImages(@Param('id') id: string, @Req() req: any) {
    return this.opsService.regenImagesForProperty(Number(id), Number(req.user?.sub) || null);
  }
}
