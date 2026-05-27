import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VocabularyService {
  private readonly logger = new Logger(VocabularyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async lookup(rawTerm: string): Promise<{ mappedTo: string; category: string; confidence: number } | null> {
    const term = await this.prisma.learnedVocabulary.findFirst({
      where: {
        rawTerm: rawTerm.trim().toLowerCase(),
        confidence: { gte: 0.5 },
      },
      orderBy: { confidence: 'desc' },
    });
    if (!term) return null;
    await this.prisma.learnedVocabulary.update({
      where: { id: term.id },
      data: { usageCount: { increment: 1 } },
    });
    return { mappedTo: term.mappedTo, category: term.category, confidence: term.confidence };
  }

  async learn(rawTerm: string, mappedTo: string, category: string, userId: number, context?: string): Promise<void> {
    const existing = await this.prisma.learnedVocabulary.findFirst({
      where: { rawTerm: rawTerm.trim().toLowerCase(), mappedTo },
    });

    if (existing) {
      const newConfidence = Math.min(1.0, existing.confidence + 0.1);
      await this.prisma.learnedVocabulary.update({
        where: { id: existing.id },
        data: {
          confirmedCount: { increment: 1 },
          confidence: newConfidence,
          usageCount: { increment: 1 },
        },
      });
      await this.prisma.vocabularyLearningLog.create({
        data: { termId: existing.id, userId, action: 'confirmed', context },
      });
      this.logger.log(`VOCAB_LEARNED reinforced="${rawTerm}" → "${mappedTo}" confidence=${newConfidence}`);
    } else {
      const newTerm = await this.prisma.learnedVocabulary.create({
        data: { rawTerm: rawTerm.trim().toLowerCase(), mappedTo, category, confidence: 0.6 },
      });
      await this.prisma.vocabularyLearningLog.create({
        data: { termId: newTerm.id, userId, action: 'auto_learned', context },
      });
      this.logger.log(`VOCAB_LEARNED new="${rawTerm}" → "${mappedTo}" category=${category}`);
    }
  }

  async reject(rawTerm: string, mappedTo: string, userId: number): Promise<void> {
    const existing = await this.prisma.learnedVocabulary.findFirst({
      where: { rawTerm: rawTerm.trim().toLowerCase(), mappedTo },
    });
    if (!existing) return;
    const newConfidence = Math.max(0.0, existing.confidence - 0.2);
    await this.prisma.learnedVocabulary.update({
      where: { id: existing.id },
      data: { rejectedCount: { increment: 1 }, confidence: newConfidence },
    });
    await this.prisma.vocabularyLearningLog.create({
      data: { termId: existing.id, userId, action: 'rejected' },
    });
    this.logger.log(`VOCAB_REJECTED "${rawTerm}" → "${mappedTo}" new_confidence=${newConfidence}`);
  }

  buildClarificationQuestion(unknownTerm: string, category: string, suggestions: string[]): string {
    const suggestionsText = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
    if (category === 'district') {
      return `لم أتعرف على "${unknownTerm}" كمنطقة.\n\nهل تقصد:\n${suggestionsText}\n\nأو أخبرني بالمنطقة الأقرب لها.`;
    }
    return `لم أفهم "${unknownTerm}" بالضبط.\n\nهل تقصد:\n${suggestionsText}`;
  }

  async getTopUnlearned(limit = 10): Promise<string[]> {
    const logs = await this.prisma.vocabularyLearningLog.groupBy({
      by: ['context'],
      _count: { context: true },
      orderBy: { _count: { context: 'desc' } },
      take: limit,
    });
    return logs.map((l) => l.context ?? '').filter(Boolean);
  }
}
