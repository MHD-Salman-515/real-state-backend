export type AdvisorLanguage = 'syrian_dialect' | 'msa' | 'en';

const SYRIAN_DIALECT_KEYWORDS = [
  'شو',
  'بدك',
  'بدي',
  'هلق',
  'لسا',
  'هيك',
  'كتير',
  'مو',
  'عم',
  'رح',
  'هاد',
  'هاي',
  'منيح',
  'شلون',
  'قديش',
];

const ARABIC_REGEX = /[\u0600-\u06FF]/;
const LATIN_REGEX = /[A-Za-z]/;

export function detectAdvisorLanguage(userMessage?: string): AdvisorLanguage {
  if (!userMessage || !userMessage.trim()) {
    return 'syrian_dialect';
  }

  const normalized = userMessage.toLowerCase();
  const hasDialectKeyword = SYRIAN_DIALECT_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );

  if (hasDialectKeyword) {
    return 'syrian_dialect';
  }

  if (ARABIC_REGEX.test(normalized)) {
    return 'msa';
  }

  if (LATIN_REGEX.test(normalized) && !ARABIC_REGEX.test(normalized)) {
    return 'en';
  }

  return 'syrian_dialect';
}
