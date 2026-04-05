import { Test, TestingModule } from '@nestjs/testing';
import { TicketLogsController } from './ticket-logs.controller';

describe('TicketLogsController', () => {
  let controller: TicketLogsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketLogsController],
    }).compile();

    controller = module.get<TicketLogsController>(TicketLogsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
