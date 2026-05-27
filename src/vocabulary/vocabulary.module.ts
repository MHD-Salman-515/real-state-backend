import { Module } from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [VocabularyService],
  exports: [VocabularyService],
})
export class VocabularyModule {}
