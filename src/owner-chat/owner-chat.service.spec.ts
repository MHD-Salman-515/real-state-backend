import { ForbiddenException } from '@nestjs/common';
import { ChatIntentService } from '../chat/chat-intent.service';
import { OwnerChatService } from './owner-chat.service';

describe('OwnerChatService', () => {
  const makeService = (overrides?: Partial<any>) => {
    const prisma = {
      chatSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      property: {
        findUnique: jest.fn(),
      },
      marketData: {
        findMany: jest.fn(),
      },
      ...(overrides?.prisma || {}),
    };

    const advisorService = {
      getInsights: jest.fn(),
      trackOutcome: jest.fn(),
      evaluateMarketPrice: jest.fn(),
      investmentAnalysis: jest.fn(),
      getSellerPriceSuggestion: jest.fn(),
      buyerEvaluate: jest.fn(),
      ...(overrides?.advisorService || {}),
    };

    const marketStatsService = {
      getHeatmap: jest.fn(),
      ...(overrides?.marketStatsService || {}),
    };

    const chatIntentService =
      overrides?.chatIntentService ||
      new ChatIntentService(prisma as any);

    const ownerStrategyService = {
      getStrategy: jest.fn(),
      updateOwnerPropertyPrice: jest.fn(),
      ...(overrides?.ownerStrategyService || {}),
    };

    const service = new OwnerChatService(
      prisma as any,
      advisorService as any,
      marketStatsService as any,
      chatIntentService as any,
      ownerStrategyService as any,
      {
        getSuggestions: jest.fn(),
      } as any,
      {
        getPortfolio: jest.fn(),
      } as any,
      {
        getHistory: jest.fn(),
      } as any,
    );

    return {
      service,
      prisma,
      advisorService,
      marketStatsService,
      chatIntentService,
      ownerStrategyService,
    };
  };

  it('owner cannot access another owner session', async () => {
    const { service, prisma } = makeService();
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 12,
      ownerId: 77,
      title: null,
      status: 'ACTIVE',
      metaJson: null,
    });

    await expect(
      service.listMessages({ ownerId: 15, sessionId: 12, limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sendMessage creates USER and ASSISTANT messages', async () => {
    const { service, prisma } = makeService();
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 8,
      ownerId: 8,
      title: null,
      status: 'ACTIVE',
      metaJson: null,
    });

    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: 101,
        role: 'USER',
        text: 'مرحبا',
        intent: 'USER_INPUT',
        payloadJson: null,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 102,
        role: 'ASSISTANT',
        text: 'عنوان: اختر مهمة واضحة',
        intent: 'FALLBACK',
        payloadJson: null,
        createdAt: new Date(),
      });

    prisma.chatSession.update.mockResolvedValue({
      id: 8,
      updatedAt: new Date(),
    });

    await service.sendMessage({
      ownerId: 8,
      sessionId: 8,
      message: 'مرحبا',
    });

    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.chatMessage.create.mock.calls[0][0].data.role).toBe('USER');
    expect(prisma.chatMessage.create.mock.calls[1][0].data.role).toBe('ASSISTANT');
  });

  it('context fallback uses session propertyId when missing in message context', async () => {
    const { service, prisma, ownerStrategyService } = makeService();
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 8,
      ownerId: 8,
      title: 'chat',
      status: 'ACTIVE',
      metaJson: { context: { propertyId: 55 } },
    });

    ownerStrategyService.getStrategy.mockResolvedValue({
      property: { id: 55, city: 'damascus', address: 'mazzeh', type: 'APARTMENT', area: 120, price: 1000 },
      seller: { optimal_price_syp: 1000, fast_sale_price_syp: 900, confidence: 0.8 },
      insights: { stats: {} },
      simulation: { deviation_percent: 0 },
      recommendations: {
        fast: { target_price_syp: 900 },
        balanced: { target_price_syp: 1000 },
        profit: { target_price_syp: 1100 },
      },
      objections: [],
      strategy_log_id: '123',
    });

    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: 1,
        role: 'USER',
        text: 'قيّم سعر عقار',
        intent: 'USER_INPUT',
        payloadJson: null,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 2,
        role: 'TOOL',
        text: 'TOOL owner_strategy executed',
        intent: 'PROPERTY_STRATEGY',
        payloadJson: {},
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 3,
        role: 'ASSISTANT',
        text: 'ok',
        intent: 'PROPERTY_STRATEGY',
        payloadJson: {},
        createdAt: new Date(),
      });

    prisma.chatSession.update.mockResolvedValue({ id: 8, updatedAt: new Date() });
    prisma.property.findUnique.mockResolvedValue({
      id: 55,
      ownerId: 8,
      title: 'x',
      city: 'damascus',
      address: 'mazzeh',
      type: 'APARTMENT',
      area: 100,
      price: 1000,
    });

    await service.sendMessage({
      ownerId: 8,
      sessionId: 8,
      message: 'قيّم سعر عقار',
    });

    expect(ownerStrategyService.getStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: 55 }),
    );
  });

  it('apply price action rejects when property is owned by another user', async () => {
    const { service, prisma } = makeService();
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 20,
      ownerId: 10,
      status: 'ACTIVE',
      title: null,
      metaJson: null,
    });

    prisma.property.findUnique.mockResolvedValue({
      id: 77,
      ownerId: 99,
      city: 'damascus',
      title: 'x',
      address: 'mazzeh',
      type: 'APARTMENT',
      area: 100,
      price: 1000,
    });

    await expect(
      service.applyPriceAction({ ownerId: 10, sessionId: 20, propertyId: 77, price: 1200 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not reuse stale property state for a fresh valuation request', async () => {
    const { service, advisorService } = makeService();

    const result = await (service as any).handleMarketIntelligenceRoute({
      ownerId: 8,
      message: 'بدي تقييم عقار',
      advisorIntent: 'PROPERTY_EVALUATION',
      language: 'ar',
      state: {
        district: 'المزة',
        property_type: 'apartment',
        area_m2: 120,
        ask_price: 135000,
      },
      explicitProperty: {},
      currentPropertyState: {},
      lastAssistant: null,
    });

    expect(result.response.text_ar).toContain(
      'أرسل لي نوع العقار + المنطقة + المساحة + سعر العرض',
    );
    expect(advisorService.evaluateMarketPrice).not.toHaveBeenCalled();
    expect(advisorService.getSellerPriceSuggestion).not.toHaveBeenCalled();
  });

  it('routes heatmap questions directly to market stats without legacy pricing', async () => {
    const { service, advisorService, marketStatsService } = makeService();
    marketStatsService.getHeatmap.mockResolvedValue({
      city: 'damascus',
      districts: [
        { district: 'المزة', avg_price_per_m2: 1000, market_status: 'HOT' },
        { district: 'كفرسوسة', avg_price_per_m2: 900, market_status: 'STABLE' },
      ],
    });

    const result = await (service as any).handleMarketIntelligenceRoute({
      ownerId: 8,
      message: 'ما أفضل مناطق دمشق؟',
      advisorIntent: 'MARKET_HEATMAP',
      language: 'ar',
      state: {},
      explicitProperty: {},
      currentPropertyState: {},
      lastAssistant: null,
    });

    expect(result.response.data?.market_heatmap).toBeDefined();
    expect(marketStatsService.getHeatmap).toHaveBeenCalledWith('damascus');
    expect(advisorService.getSellerPriceSuggestion).not.toHaveBeenCalled();
  });
});
