import { Controller, Get, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('test')
  @UseGuards(JwtAuthGuard)
  async test() {
    const result = await this.aiService.testConnection();
    return { result };
  }
}
