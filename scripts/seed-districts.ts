import * as dotenv from 'dotenv';
import * as path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DISTRICTS = [
  // ═══════════════════════════════════════
  // DAMASCUS — ULTRA TIER (منظمة راقية)
  // ═══════════════════════════════════════
  { nameAr: 'المالكي', nameEn: 'malki', city: 'damascus', tier: 'ultra', priceMultiplier: 1.40, lat: 33.5138, lng: 36.2765, isOrganized: true },
  { nameAr: 'أبو رمانة', nameEn: 'abu rummaneh', city: 'damascus', tier: 'ultra', priceMultiplier: 1.38, lat: 33.5115, lng: 36.2820, isOrganized: true },
  { nameAr: 'المهاجرين', nameEn: 'muhajireen', city: 'damascus', tier: 'ultra', priceMultiplier: 1.35, lat: 33.5198, lng: 36.2751, isOrganized: true },
  { nameAr: 'الروضة', nameEn: 'rawda', city: 'damascus', tier: 'ultra', priceMultiplier: 1.33, lat: 33.5098, lng: 36.2878, isOrganized: true },
  { nameAr: 'أبو رمانة - شارع بغداد', nameEn: 'baghdad street', city: 'damascus', tier: 'ultra', priceMultiplier: 1.32, lat: 33.5089, lng: 36.2912, isOrganized: true },
  { nameAr: 'الشعلان', nameEn: 'shaalaan', city: 'damascus', tier: 'ultra', priceMultiplier: 1.30, lat: 33.5072, lng: 36.2889, isOrganized: true },
  { nameAr: 'خالد بن الوليد', nameEn: 'khaled ibn al walid', city: 'damascus', tier: 'ultra', priceMultiplier: 1.28, lat: 33.5060, lng: 36.2930, isOrganized: true },
  { nameAr: 'مشروع دمر', nameEn: 'mashrou dummar', city: 'damascus', tier: 'ultra', priceMultiplier: 1.28, lat: 33.5312, lng: 36.2201, isOrganized: true },
  { nameAr: 'حي الأمين', nameEn: 'hay al ameen', city: 'damascus', tier: 'ultra', priceMultiplier: 1.26, lat: 33.5055, lng: 36.2950, isOrganized: true },

  // ═══════════════════════════════════════
  // DAMASCUS — HIGH TIER
  // ═══════════════════════════════════════
  { nameAr: 'المزة فيلات غربية', nameEn: 'mazzeh villas west', city: 'damascus', tier: 'high', priceMultiplier: 1.25, lat: 33.4978, lng: 36.2545, isOrganized: true },
  { nameAr: 'المزة فيلات شرقية', nameEn: 'mazzeh villas east', city: 'damascus', tier: 'high', priceMultiplier: 1.23, lat: 33.4985, lng: 36.2612, isOrganized: true },
  { nameAr: 'المزة', nameEn: 'mazzeh', city: 'damascus', tier: 'high', priceMultiplier: 1.20, lat: 33.4990, lng: 36.2600, isOrganized: true },
  { nameAr: 'كفرسوسة', nameEn: 'kafr sousa', city: 'damascus', tier: 'high', priceMultiplier: 1.18, lat: 33.4921, lng: 36.2734, isOrganized: true },
  { nameAr: 'الصالحية', nameEn: 'salihiyeh', city: 'damascus', tier: 'high', priceMultiplier: 1.18, lat: 33.5201, lng: 36.2812, isOrganized: true },
  { nameAr: 'المزرعة', nameEn: 'mazraa', city: 'damascus', tier: 'high', priceMultiplier: 1.15, lat: 33.5089, lng: 36.2978, isOrganized: true },
  { nameAr: 'الجلاء', nameEn: 'jalaa', city: 'damascus', tier: 'high', priceMultiplier: 1.13, lat: 33.5012, lng: 36.2834, isOrganized: true },
  { nameAr: 'ضاحية الشام الجديدة', nameEn: 'new damascus suburb', city: 'damascus', tier: 'high', priceMultiplier: 1.12, lat: 33.5234, lng: 36.2456, isOrganized: true },
  { nameAr: 'الشهداء', nameEn: 'shuhada', city: 'damascus', tier: 'high', priceMultiplier: 1.10, lat: 33.5156, lng: 36.2923, isOrganized: true },

  // ═══════════════════════════════════════
  // DAMASCUS — MEDIUM TIER
  // ═══════════════════════════════════════
  { nameAr: 'ركن الدين', nameEn: 'rukn al-din', city: 'damascus', tier: 'medium', priceMultiplier: 1.08, lat: 33.5289, lng: 36.2934, isOrganized: true },
  { nameAr: 'القصاع', nameEn: 'qassaa', city: 'damascus', tier: 'medium', priceMultiplier: 1.07, lat: 33.5145, lng: 36.3134, isOrganized: true },
  { nameAr: 'البرامكة', nameEn: 'baramkeh', city: 'damascus', tier: 'medium', priceMultiplier: 1.06, lat: 33.5034, lng: 36.3089, isOrganized: true },
  { nameAr: 'الميدان', nameEn: 'midan', city: 'damascus', tier: 'medium', priceMultiplier: 1.05, lat: 33.4934, lng: 36.3012, isOrganized: true },
  { nameAr: 'الحجاز', nameEn: 'hijaz', city: 'damascus', tier: 'medium', priceMultiplier: 1.05, lat: 33.5067, lng: 36.3045, isOrganized: true },
  { nameAr: 'المجتهد', nameEn: 'mujtahid', city: 'damascus', tier: 'medium', priceMultiplier: 1.04, lat: 33.4989, lng: 36.3067, isOrganized: true },
  { nameAr: 'الأنصاري', nameEn: 'ansari', city: 'damascus', tier: 'medium', priceMultiplier: 1.03, lat: 33.4967, lng: 36.3089, isOrganized: true },
  { nameAr: 'كشكول', nameEn: 'kashkoul', city: 'damascus', tier: 'medium', priceMultiplier: 1.02, lat: 33.5023, lng: 36.3112, isOrganized: true },
  { nameAr: 'الورود', nameEn: 'wuroud', city: 'damascus', tier: 'medium', priceMultiplier: 1.05, lat: 33.5178, lng: 36.2867, isOrganized: true },
  { nameAr: 'النضال', nameEn: 'nidal', city: 'damascus', tier: 'medium', priceMultiplier: 1.02, lat: 33.5089, lng: 36.3034, isOrganized: true },
  { nameAr: 'الوحدة', nameEn: 'wahda', city: 'damascus', tier: 'medium', priceMultiplier: 1.02, lat: 33.5045, lng: 36.3056, isOrganized: true },

  // ═══════════════════════════════════════
  // DAMASCUS — HISTORIC (منظمة تاريخية)
  // ═══════════════════════════════════════
  { nameAr: 'دمشق القديمة', nameEn: 'old damascus', city: 'damascus', tier: 'medium', priceMultiplier: 1.05, lat: 33.5114, lng: 36.3062, isOrganized: true },
  { nameAr: 'القيمرية', nameEn: 'qaymariyeh', city: 'damascus', tier: 'medium', priceMultiplier: 1.04, lat: 33.5089, lng: 36.3089, isOrganized: true },
  { nameAr: 'باب شرقي', nameEn: 'bab sharqi', city: 'damascus', tier: 'medium', priceMultiplier: 1.03, lat: 33.5098, lng: 36.3121, isOrganized: true },
  { nameAr: 'باب توما', nameEn: 'bab touma', city: 'damascus', tier: 'medium', priceMultiplier: 1.03, lat: 33.5134, lng: 36.3098, isOrganized: true },
  { nameAr: 'الحريقة', nameEn: 'hariqah', city: 'damascus', tier: 'medium', priceMultiplier: 1.02, lat: 33.5078, lng: 36.3045, isOrganized: true },
  { nameAr: 'العمارة', nameEn: 'imarah', city: 'damascus', tier: 'medium', priceMultiplier: 1.02, lat: 33.5101, lng: 36.3067, isOrganized: true },
  { nameAr: 'ساروجة', nameEn: 'sarouja', city: 'damascus', tier: 'medium', priceMultiplier: 1.01, lat: 33.5145, lng: 36.3034, isOrganized: true },
  { nameAr: 'الشاغور', nameEn: 'shaghour', city: 'damascus', tier: 'medium', priceMultiplier: 1.00, lat: 33.5056, lng: 36.3098, isOrganized: true },
  { nameAr: 'القنوات', nameEn: 'qanawat', city: 'damascus', tier: 'medium', priceMultiplier: 1.00, lat: 33.5023, lng: 36.3134, isOrganized: true },
  { nameAr: 'مئذنة الشحم', nameEn: 'mazanat al shahm', city: 'damascus', tier: 'medium', priceMultiplier: 0.98, lat: 33.5134, lng: 36.3078, isOrganized: true },

  // ═══════════════════════════════════════
  // DAMASCUS — LOW TIER
  // ═══════════════════════════════════════
  { nameAr: 'جوبر', nameEn: 'jobar', city: 'damascus', tier: 'low', priceMultiplier: 0.85, lat: 33.5198, lng: 36.3312, isOrganized: false },
  { nameAr: 'التضامن', nameEn: 'tadamon', city: 'damascus', tier: 'low', priceMultiplier: 0.80, lat: 33.4812, lng: 36.3198, isOrganized: false },
  { nameAr: 'القدم', nameEn: 'qadam', city: 'damascus', tier: 'low', priceMultiplier: 0.80, lat: 33.4778, lng: 36.3089, isOrganized: false },
  { nameAr: 'عش الورور', nameEn: 'ush al wawur', city: 'damascus', tier: 'low', priceMultiplier: 0.75, lat: 33.4823, lng: 36.3156, isOrganized: false },
  { nameAr: 'القابون', nameEn: 'qaboun', city: 'damascus', tier: 'low', priceMultiplier: 0.82, lat: 33.5312, lng: 36.3389, isOrganized: false },
  { nameAr: 'برزة', nameEn: 'barzeh', city: 'damascus', tier: 'low', priceMultiplier: 0.88, lat: 33.5389, lng: 36.3112, isOrganized: false },
  { nameAr: 'دويلعة', nameEn: 'duwaylah', city: 'damascus', tier: 'low', priceMultiplier: 0.78, lat: 33.4756, lng: 36.3234, isOrganized: false },

  // ═══════════════════════════════════════
  // RIF DIMASHQ — HIGH TIER
  // ═══════════════════════════════════════
  { nameAr: 'ضاحية قدسيا', nameEn: 'qudsaya', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.12, lat: 33.5512, lng: 36.2334, isOrganized: true },
  { nameAr: 'الهامة', nameEn: 'hameh', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.10, lat: 33.5434, lng: 36.2112, isOrganized: true },
  { nameAr: 'عين الفيجة', nameEn: 'ain al fijah', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.08, lat: 33.5889, lng: 36.1534, isOrganized: true },
  { nameAr: 'الزبداني', nameEn: 'zabadani', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.05, lat: 33.7234, lng: 36.0934, isOrganized: true },
  { nameAr: 'بلودان', nameEn: 'bludan', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.08, lat: 33.7089, lng: 36.0712, isOrganized: true },
  { nameAr: 'صيدنايا', nameEn: 'saidnaya', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.05, lat: 33.6978, lng: 36.3734, isOrganized: true },
  { nameAr: 'معلولا', nameEn: 'maalula', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.05, lat: 33.8434, lng: 36.5512, isOrganized: true },

  // ═══════════════════════════════════════
  // RIF DIMASHQ — MEDIUM TIER
  // ═══════════════════════════════════════
  { nameAr: 'جرمانا', nameEn: 'jaramana', city: 'rif dimashq', tier: 'medium', priceMultiplier: 1.00, lat: 33.4812, lng: 36.3512, isOrganized: false },
  { nameAr: 'داريا', nameEn: 'darayya', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.95, lat: 33.4601, lng: 36.2445, isOrganized: true },
  { nameAr: 'حرستا', nameEn: 'harasta', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.92, lat: 33.5534, lng: 36.3712, isOrganized: false },
  { nameAr: 'جديدة الشيباني', nameEn: 'jadidat al sheibani', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.92, lat: 33.4723, lng: 36.2812, isOrganized: true },
  { nameAr: 'دوما', nameEn: 'douma', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.90, lat: 33.5712, lng: 36.4012, isOrganized: false },
  { nameAr: 'عدرا', nameEn: 'adra', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.88, lat: 33.6089, lng: 36.5234, isOrganized: true },
  { nameAr: 'التل', nameEn: 'tal', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.88, lat: 33.6134, lng: 36.3512, isOrganized: true },
  { nameAr: 'قطنا', nameEn: 'qatana', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.87, lat: 33.4312, lng: 36.0734, isOrganized: true },
  { nameAr: 'السيدة زينب', nameEn: 'sayyida zainab', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.90, lat: 33.4534, lng: 36.3289, isOrganized: false },
  { nameAr: 'ببيلا', nameEn: 'babila', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.88, lat: 33.4623, lng: 36.3334, isOrganized: false },
  { nameAr: 'يلدا', nameEn: 'yalda', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.87, lat: 33.4589, lng: 36.3312, isOrganized: false },
  { nameAr: 'معضمية الشام', nameEn: 'muadamiyat al sham', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.87, lat: 33.4712, lng: 36.2212, isOrganized: true },
  { nameAr: 'الكسوة', nameEn: 'kisweh', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.85, lat: 33.3734, lng: 36.2434, isOrganized: true },

  // ═══════════════════════════════════════
  // RIF DIMASHQ — LOW TIER
  // ═══════════════════════════════════════
  { nameAr: 'عرطوز', nameEn: 'artouz', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.85, lat: 33.4534, lng: 36.2112, isOrganized: false },
  { nameAr: 'صحنايا', nameEn: 'sahnaya', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.83, lat: 33.4423, lng: 36.2334, isOrganized: false },
  { nameAr: 'المليحة', nameEn: 'mleiha', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.82, lat: 33.4712, lng: 36.3834, isOrganized: false },
  { nameAr: 'حجر الأسود', nameEn: 'hajar al aswad', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.75, lat: 33.4623, lng: 36.3156, isOrganized: false },
  { nameAr: 'مخيم اليرموك', nameEn: 'yarmouk camp', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.70, lat: 33.4756, lng: 36.2978, isOrganized: false },
  { nameAr: 'مخيم جرمانا', nameEn: 'jaramana camp', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.72, lat: 33.4789, lng: 36.3534, isOrganized: false },

  // ═══════════════════════════════════════
  // ALEPPO — حلب
  // ═══════════════════════════════════════
  { nameAr: 'العزيزية', nameEn: 'aziziyeh', city: 'aleppo', tier: 'high', priceMultiplier: 1.15, lat: 36.2012, lng: 37.1534, isOrganized: true },
  { nameAr: 'الحمدانية', nameEn: 'hamdaniyeh', city: 'aleppo', tier: 'high', priceMultiplier: 1.18, lat: 36.1934, lng: 37.1312, isOrganized: true },
  { nameAr: 'السريان', nameEn: 'suryan', city: 'aleppo', tier: 'high', priceMultiplier: 1.12, lat: 36.2089, lng: 37.1423, isOrganized: true },
  { nameAr: 'الفرقان', nameEn: 'furqan', city: 'aleppo', tier: 'medium', priceMultiplier: 1.05, lat: 36.1978, lng: 37.1589, isOrganized: true },
  { nameAr: 'الشهباء', nameEn: 'shahba', city: 'aleppo', tier: 'medium', priceMultiplier: 1.05, lat: 36.2134, lng: 37.1678, isOrganized: true },
  { nameAr: 'المحافظة', nameEn: 'muhafaza', city: 'aleppo', tier: 'medium', priceMultiplier: 1.03, lat: 36.2023, lng: 37.1612, isOrganized: true },
  { nameAr: 'حلب القديمة', nameEn: 'old aleppo', city: 'aleppo', tier: 'medium', priceMultiplier: 1.00, lat: 36.2034, lng: 37.1589, isOrganized: true },
  { nameAr: 'الميدان حلب', nameEn: 'midan aleppo', city: 'aleppo', tier: 'medium', priceMultiplier: 0.98, lat: 36.1912, lng: 37.1734, isOrganized: false },
  { nameAr: 'الراموسة', nameEn: 'ramouseh', city: 'aleppo', tier: 'low', priceMultiplier: 0.85, lat: 36.1712, lng: 37.1234, isOrganized: false },

  // ═══════════════════════════════════════
  // HOMS — حمص
  // ═══════════════════════════════════════
  { nameAr: 'الوعر', nameEn: 'al waer', city: 'homs', tier: 'medium', priceMultiplier: 0.90, lat: 34.7312, lng: 36.6834, isOrganized: false },
  { nameAr: 'الحميدية', nameEn: 'al hamidiyah', city: 'homs', tier: 'medium', priceMultiplier: 1.05, lat: 34.7412, lng: 36.7112, isOrganized: true },
  { nameAr: 'الزهراء', nameEn: 'zahraa', city: 'homs', tier: 'high', priceMultiplier: 1.10, lat: 34.7534, lng: 36.7234, isOrganized: true },
  { nameAr: 'عكرمة', nameEn: 'akrameh', city: 'homs', tier: 'medium', priceMultiplier: 0.95, lat: 34.7289, lng: 36.7023, isOrganized: true },
  { nameAr: 'القصور حمص', nameEn: 'qusour homs', city: 'homs', tier: 'high', priceMultiplier: 1.08, lat: 34.7456, lng: 36.7189, isOrganized: true },

  // ═══════════════════════════════════════
  // LATAKIA — اللاذقية
  // ═══════════════════════════════════════
  { nameAr: 'الزراعة', nameEn: 'ziraa', city: 'latakia', tier: 'high', priceMultiplier: 1.15, lat: 35.5312, lng: 35.7934, isOrganized: true },
  { nameAr: 'الشيخ ضاهر', nameEn: 'sheikh daher', city: 'latakia', tier: 'high', priceMultiplier: 1.12, lat: 35.5234, lng: 35.7856, isOrganized: true },
  { nameAr: 'الرمل الجنوبي', nameEn: 'raml south', city: 'latakia', tier: 'medium', priceMultiplier: 1.05, lat: 35.5089, lng: 35.7712, isOrganized: true },
  { nameAr: 'الرمل الشمالي', nameEn: 'raml north', city: 'latakia', tier: 'medium', priceMultiplier: 1.03, lat: 35.5156, lng: 35.7778, isOrganized: true },

  // ═══════════════════════════════════════
  // TARTOUS — طرطوس
  // ═══════════════════════════════════════
  { nameAr: 'الرمل طرطوس', nameEn: 'al raml tartous', city: 'tartous', tier: 'medium', priceMultiplier: 1.00, lat: 34.8934, lng: 35.8912, isOrganized: true },
  { nameAr: 'بانياس', nameEn: 'baniyas', city: 'tartous', tier: 'medium', priceMultiplier: 0.95, lat: 35.1823, lng: 35.9456, isOrganized: true },

  // ═══════════════════════════════════════
  // HAMA — حماة
  // ═══════════════════════════════════════
  { nameAr: 'الحمدانية حماة', nameEn: 'hamdaniyeh hama', city: 'hama', tier: 'high', priceMultiplier: 1.08, lat: 35.1434, lng: 36.7589, isOrganized: true },
  { nameAr: 'الحاضر', nameEn: 'hader', city: 'hama', tier: 'medium', priceMultiplier: 1.00, lat: 35.1312, lng: 36.7512, isOrganized: true },
  { nameAr: 'أبو الفداء', nameEn: 'abu al fida', city: 'hama', tier: 'medium', priceMultiplier: 0.98, lat: 35.1256, lng: 36.7434, isOrganized: true },

  // ═══════════════════════════════════════
  // DARAA — درعا
  // ═══════════════════════════════════════
  { nameAr: 'درعا البلد', nameEn: 'daraa al balad', city: 'daraa', tier: 'medium', priceMultiplier: 0.90, lat: 32.6234, lng: 36.1034, isOrganized: false },
  { nameAr: 'المحطة درعا', nameEn: 'mahatta daraa', city: 'daraa', tier: 'medium', priceMultiplier: 0.88, lat: 32.6289, lng: 36.1089, isOrganized: false },

  // ═══════════════════════════════════════
  // DEIR EZ-ZOR — دير الزور
  // ═══════════════════════════════════════
  { nameAr: 'الميادين', nameEn: 'mayadin', city: 'deir ez-zor', tier: 'medium', priceMultiplier: 0.85, lat: 35.0134, lng: 40.4512, isOrganized: false },
  { nameAr: 'القصور دير الزور', nameEn: 'qusour deir ez-zor', city: 'deir ez-zor', tier: 'medium', priceMultiplier: 0.88, lat: 35.3312, lng: 40.1334, isOrganized: true },
];

function parseDbUrl(raw: string): mysql.ConnectionOptions {
  const u = new URL(raw);
  const opts: mysql.ConnectionOptions = {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
  if (u.searchParams.get('ssl-mode') === 'REQUIRED') opts.ssl = { rejectUnauthorized: false };
  return opts;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const conn = await mysql.createConnection(parseDbUrl(dbUrl));

  try {
    let inserted = 0;
    let skipped = 0;

    for (const d of DISTRICTS) {
      const [existing] = await conn.execute(
        'SELECT id FROM `districts` WHERE nameEn = ? AND city = ?',
        [d.nameEn, d.city],
      );
      if ((existing as any[]).length > 0) { skipped++; continue; }

      await conn.execute(
        `INSERT INTO \`districts\` (nameAr, nameEn, city, tier, priceMultiplier, lat, lng, isOrganized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.nameAr, d.nameEn, d.city, d.tier, d.priceMultiplier, d.lat ?? null, d.lng ?? null, d.isOrganized ? 1 : 0],
      );
      inserted++;
    }

    console.log(`Done. Inserted: ${inserted}, Skipped (already exist): ${skipped}`);
  } finally {
    await conn.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
