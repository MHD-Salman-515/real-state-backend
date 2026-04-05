import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminChatController } from './admin-chat.controller';
import { AdminChatService } from './admin-chat.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminChatController],
  providers: [AdminChatService],
})
export class AdminChatModule {}
