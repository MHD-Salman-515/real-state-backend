import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(): Promise<{
    status: 'ok';
    db_housing: 'ok' | 'fail';
    db_urbanex: 'ok' | 'fail';
    time: string;
  }> {
    const [dbHousing, dbUrbanex] = await Promise.all([
      this.healthService.getHousingDbStatus(),
      this.healthService.getUrbanexDbStatus(),
    ]);

    return {
      status: 'ok',
      db_housing: dbHousing,
      db_urbanex: dbUrbanex,
      time: new Date().toISOString(),
    };
  }
}
