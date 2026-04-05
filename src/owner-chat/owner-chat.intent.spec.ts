import { detectOwnerChatIntent } from './owner-chat.intent';

describe('detectOwnerChatIntent', () => {
  it.each([
    'قيّم سعر عقاري',
    'strategy for my property',
    'اقترح سعر',
  ])('detects PROPERTY_STRATEGY: %s', (message) => {
    expect(
      detectOwnerChatIntent({ message, contextPropertyId: 12 }),
    ).toBe('PROPERTY_STRATEGY');
  });

  it.each([
    'اعطني مهامي',
    'to-do list',
    'شو المهام الذكية',
  ])('detects SUGGESTIONS_QUEUE: %s', (message) => {
    expect(detectOwnerChatIntent({ message })).toBe('SUGGESTIONS_QUEUE');
  });

  it.each([
    'محفظتي اليوم',
    'portfolio summary',
    'تحليل portfolio',
  ])('detects PORTFOLIO: %s', (message) => {
    expect(detectOwnerChatIntent({ message })).toBe('PORTFOLIO');
  });

  it.each([
    'مراقبة السوق',
    'market insights damascus',
    'ترند وتقلب المنطقة',
  ])('detects MARKET_WATCH_INSIGHTS: %s', (message) => {
    expect(detectOwnerChatIntent({ message })).toBe('MARKET_WATCH_INSIGHTS');
  });

  it.each([
    'سجل ai',
    'history',
    'سجل urbanex',
  ])('detects AI_HISTORY: %s', (message) => {
    expect(detectOwnerChatIntent({ message })).toBe('AI_HISTORY');
  });
});
