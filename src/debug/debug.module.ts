import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [DebugController],
})
export class DebugModule {}
