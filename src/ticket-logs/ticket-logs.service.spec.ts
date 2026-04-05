import { Test, TestingModule } from '@nestjs/testing';
import { TicketLogsService } from './ticket-logs.service';

describe('TicketLogsService', () => {
  let service: TicketLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TicketLogsService],
    }).compile();

    service = module.get<TicketLogsService>(TicketLogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
