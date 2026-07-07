import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {
  AppointmentStatus,
  InvoiceStatus,
  InvoiceType,
  Prisma,
  PrismaClient,
  Property_type,
  Role,
  RoomType,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = '12345678';

const ROOM_TYPES: RoomType[] = ['LIVING', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'EXTERIOR', 'BALCONY'];
const ROOM_IMAGE_URLS: Record<RoomType, string[]> = {
  LIVING: [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80',
  ],
  BEDROOM: [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
  ],
  KITCHEN: [
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80',
  ],
  BATHROOM: [
    'https://images.unsplash.com/photo-1620626011761-996317702431?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80',
  ],
  EXTERIOR: [
    'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
  ],
  BALCONY: [
    'https://images.unsplash.com/photo-1472224371017-08207f84aaae?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
  ],
};

const DISTRICTS = [
  { nameAr: 'المالكي', nameEn: 'malki', city: 'damascus', tier: 'ultra', priceMultiplier: 1.4, lat: 33.5138, lng: 36.2765, isOrganized: true },
  { nameAr: 'أبو رمانة', nameEn: 'abu rummaneh', city: 'damascus', tier: 'ultra', priceMultiplier: 1.35, lat: 33.5115, lng: 36.282, isOrganized: true },
  { nameAr: 'المزة', nameEn: 'mazzeh', city: 'damascus', tier: 'high', priceMultiplier: 1.2, lat: 33.499, lng: 36.26, isOrganized: true },
  { nameAr: 'كفرسوسة', nameEn: 'kafr sousa', city: 'damascus', tier: 'high', priceMultiplier: 1.18, lat: 33.4921, lng: 36.2734, isOrganized: true },
  { nameAr: 'مشروع دمر', nameEn: 'mashrou dummar', city: 'damascus', tier: 'high', priceMultiplier: 1.28, lat: 33.5312, lng: 36.2201, isOrganized: true },
  { nameAr: 'يعفور', nameEn: 'yafour', city: 'damascus', tier: 'high', priceMultiplier: 1.1, lat: 33.465, lng: 36.305, isOrganized: true },
  { nameAr: 'قدسيا', nameEn: 'qudsaya', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.12, lat: 33.5512, lng: 36.2334, isOrganized: true },
  { nameAr: 'جرمانا', nameEn: 'jaramana', city: 'rif dimashq', tier: 'medium', priceMultiplier: 1.0, lat: 33.4812, lng: 36.3512, isOrganized: false },
  { nameAr: 'صحنايا', nameEn: 'sahnaya', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.83, lat: 33.4423, lng: 36.2334, isOrganized: false },
  { nameAr: 'باب توما', nameEn: 'bab touma', city: 'damascus', tier: 'medium', priceMultiplier: 1.03, lat: 33.5134, lng: 36.3098, isOrganized: true },
  { nameAr: 'الشعلان', nameEn: 'shaalaan', city: 'damascus', tier: 'ultra', priceMultiplier: 1.3, lat: 33.5072, lng: 36.2889, isOrganized: true },
  { nameAr: 'البرامكة', nameEn: 'baramkeh', city: 'damascus', tier: 'medium', priceMultiplier: 1.06, lat: 33.5034, lng: 36.3089, isOrganized: true },
  { nameAr: 'الميدان', nameEn: 'midan', city: 'damascus', tier: 'medium', priceMultiplier: 1.05, lat: 33.4934, lng: 36.3012, isOrganized: true },
  { nameAr: 'ركن الدين', nameEn: 'rukn al-din', city: 'damascus', tier: 'medium', priceMultiplier: 1.08, lat: 33.5289, lng: 36.2934, isOrganized: true },
  { nameAr: 'العزيزية', nameEn: 'aziziyeh', city: 'aleppo', tier: 'high', priceMultiplier: 1.15, lat: 36.2012, lng: 37.1534, isOrganized: true },
  { nameAr: 'الحميدية', nameEn: 'al hamidiyah', city: 'homs', tier: 'medium', priceMultiplier: 1.05, lat: 34.7412, lng: 36.7112, isOrganized: true },
  { nameAr: 'الزراعة', nameEn: 'ziraa', city: 'latakia', tier: 'high', priceMultiplier: 1.15, lat: 35.5312, lng: 35.7934, isOrganized: true },
  { nameAr: 'الرمل طرطوس', nameEn: 'al raml tartous', city: 'tartous', tier: 'medium', priceMultiplier: 1.0, lat: 34.8934, lng: 35.8912, isOrganized: true },
  { nameAr: 'الحاضر', nameEn: 'hader', city: 'hama', tier: 'medium', priceMultiplier: 1.0, lat: 35.1312, lng: 36.7512, isOrganized: true },
];

const USER_DEFINITIONS = [
  { email: 'admin.urbanex@example.com', fullName: 'سلمان عبد الرحمن', role: Role.ADMIN, phone: '+963938411111' },
  { email: 'owner1.urbanex@example.com', fullName: 'محمد الخطيب', role: Role.OWNER, phone: '+963938411112' },
  { email: 'owner2.urbanex@example.com', fullName: 'أحمد الحسن', role: Role.OWNER, phone: '+963938411113' },
  { email: 'owner3.urbanex@example.com', fullName: 'ليث العمر', role: Role.OWNER, phone: '+963938411114' },
  { email: 'client1.urbanex@example.com', fullName: 'رنا الشهابي', role: Role.CLIENT, phone: '+963938411115' },
  { email: 'client2.urbanex@example.com', fullName: 'تيماء أبو زيد', role: Role.CLIENT, phone: '+963938411116' },
  { email: 'client3.urbanex@example.com', fullName: 'فادي المولى', role: Role.CLIENT, phone: '+963938411117' },
  { email: 'agent1.urbanex@example.com', fullName: 'يوسف النجار', role: Role.AGENT, phone: '+963938411118' },
  { email: 'agent2.urbanex@example.com', fullName: 'مروان القادري', role: Role.AGENT, phone: '+963938411119' },
  { email: 'accountant.urbanex@example.com', fullName: 'سمر الزعة', role: Role.ACCOUNTANT, phone: '+963938411120' },
  { email: 'supplier.urbanex@example.com', fullName: 'حسام السلفي', role: Role.SUPPLIER, phone: '+963938411121' },
  { email: 'worker1.urbanex@example.com', fullName: 'باسل الشطي', role: Role.WORKER, phone: '+963938411122' },
  { email: 'worker2.urbanex@example.com', fullName: 'غدير الرفاعي', role: Role.WORKER, phone: '+963938411123' },
];

const PROPERTY_TEMPLATES = [
  { title: 'شقة فاخرة في المالكي', city: 'damascus', district: 'malki', area: 165, price: 2150000000, type: Property_type.APARTMENT, ownerIndex: 0, description: 'شقة حديثة مع مطبخ مفتوح وإطلالة على الحديقة في أحد أرقى شوارع المالكي.', featured: true },
  { title: 'شقة عائلية في أبو رمانة', city: 'damascus', district: 'abu rummaneh', area: 145, price: 1820000000, type: Property_type.APARTMENT, ownerIndex: 1, description: 'شقة مريحة ومجهزة مع غرفتين نوم وموقف سيارات مغطى في منطقة هادئة.', featured: true },
  { title: 'فيلا جديدة في المزة', city: 'damascus', district: 'mazzeh', area: 320, price: 3850000000, type: Property_type.VILLA, ownerIndex: 1, description: 'فيلا عائلية حديثة بمساحة واسعة ومسبح صغير وحديقة متوسطة.', featured: true },
  { title: 'شقة تجارية في كفرسوسة', city: 'damascus', district: 'kafr sousa', area: 120, price: 980000000, type: Property_type.APARTMENT, ownerIndex: 0, description: 'شقة للمكاتب مع تقسيم عملي وموقع مناسب لقربه من المراكز الحيوية.', featured: false },
  { title: 'أرض سكنية في مشروع دمر', city: 'damascus', district: 'mashrou dummar', area: 550, price: 1320000000, type: Property_type.LAND, ownerIndex: 2, description: 'أرض جاهزة للبناء في مشروع دمر مع وصول كهرباء ومياه.', featured: false },
  { title: 'شقة للإيجار في الميدان', city: 'damascus', district: 'midan', area: 95, price: 420000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة للإيجار تتضمن غرفتي نوم ومطبخ حديث وسعر مناسب للمستأجرين.', featured: false },
  { title: 'بيت فخم في يعفور', city: 'damascus', district: 'yafour', area: 260, price: 2480000000, type: Property_type.HOUSE, ownerIndex: 1, description: 'بيت مستقل بمساحة كبيرة وممر واسع ومرافق عائلية مريحة.', featured: true },
  { title: 'شقة حديثة في ركن الدين', city: 'damascus', district: 'rukn al-din', area: 115, price: 910000000, type: Property_type.APARTMENT, ownerIndex: 0, description: 'شقة مع دورات مياه حديثة وموقع ممتاز قرب المتاجر والخدمات.', featured: false },
  { title: 'محل تجاري في الشعلان', city: 'damascus', district: 'shaalaan', area: 88, price: 760000000, type: Property_type.HOUSE, ownerIndex: 0, description: 'محل تجاري سكني مع واجهة ممتازة ومكان مناسب للأعمال.', featured: true },
  { title: 'شقة مودرن في البرامكة', city: 'damascus', district: 'baramkeh', area: 132, price: 1180000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة مؤثثة جزئياً مع إطلالة جميلة ومصعد وموقف.', featured: false },
  { title: 'فيلا في باب توما', city: 'damascus', district: 'bab touma', area: 280, price: 2950000000, type: Property_type.VILLA, ownerIndex: 1, description: 'فيلا تاريخية مع طابع دمشق القديم ومرافق ممتازة.', featured: true },
  { title: 'استوديو في المزة', city: 'damascus', district: 'mazzeh', area: 62, price: 645000000, type: Property_type.STUDIO, ownerIndex: 2, description: 'استوديو عملي ومناسب للعزاب أو المستثمرين قصيري المدى.', featured: false },
  { title: 'شقة عائلية في قدسيا', city: 'rif dimashq', district: 'qudsaya', area: 158, price: 940000000, type: Property_type.APARTMENT, ownerIndex: 0, description: 'شقة بأسعار مناسبة في منطقة هادئة قرب الخدمات الأساسية.', featured: false },
  { title: 'بيت مستقل في جرمانا', city: 'rif dimashq', district: 'jaramana', area: 230, price: 1120000000, type: Property_type.HOUSE, ownerIndex: 1, description: 'بيت مستقل مع حدائق صغيرة وموقع مناسب للعائلات.', featured: false },
  { title: 'شقة للإيجار في صحنايا', city: 'rif dimashq', district: 'sahnaya', area: 110, price: 390000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة للإيجار ومريحة مع تشطيب بسيط وملحقات أساسية.', featured: false },
  { title: 'فيلا في العزيزية', city: 'aleppo', district: 'aziziyeh', area: 310, price: 1750000000, type: Property_type.VILLA, ownerIndex: 2, description: 'فيلا حديثة في حلب مع مساحة واسعة وواجهات أنيقة.', featured: true },
  { title: 'شقة حديثة في الحميدية', city: 'homs', district: 'al hamidiyah', area: 135, price: 660000000, type: Property_type.APARTMENT, ownerIndex: 1, description: 'شقة في الحي المركزي مع سهولة الوصول إلى المدارس والمرافق.', featured: false },
  { title: 'شقة overlooking في اللاذقية', city: 'latakia', district: 'ziraa', area: 126, price: 780000000, type: Property_type.APARTMENT, ownerIndex: 0, description: 'شقة مطلة على البحر مع تهوية ممتازة وتجهيزات حديثة.', featured: false },
  { title: 'بيت ساحلي في طرطوس', city: 'tartous', district: 'al raml tartous', area: 210, price: 860000000, type: Property_type.HOUSE, ownerIndex: 2, description: 'بيت مناسب للاستجمام مع موقع قريب من الشاطئ.', featured: false },
  { title: 'شقة عائلية في حماة', city: 'hama', district: 'hader', area: 118, price: 510000000, type: Property_type.APARTMENT, ownerIndex: 1, description: 'شقة عائلية ذات توزيع عملي وموقع مريح.', featured: false },
  { title: 'مكتب إداري في المالكي', city: 'damascus', district: 'malki', area: 95, price: 1350000000, type: Property_type.APARTMENT, ownerIndex: 0, description: 'مكتب حديث في الطابق العلوي مع تجهيزات مكتبية كاملة وموقف.', featured: false },
  { title: 'شقة بحديقة في أبو رمانة', city: 'damascus', district: 'abu rummaneh', area: 152, price: 1980000000, type: Property_type.APARTMENT, ownerIndex: 1, description: 'شقة عصرية مع نافذة كبيرة وحديقة مشتركة داخل المبنى.', featured: false },
  { title: 'بيت مستقل في المزة', city: 'damascus', district: 'mazzeh', area: 265, price: 2640000000, type: Property_type.HOUSE, ownerIndex: 0, description: 'بيت مستقل يقدم مساحة واسعة وأجواء هادئة بين شوارع المزة.', featured: true },
  { title: 'استوديو في كفرسوسة', city: 'damascus', district: 'kafr sousa', area: 58, price: 610000000, type: Property_type.STUDIO, ownerIndex: 2, description: 'استوديو عملي ومثالي للعيش أو العمل عن بُعد.', featured: false },
  { title: 'أرض تجارية في مشروع دمر', city: 'damascus', district: 'mashrou dummar', area: 700, price: 1850000000, type: Property_type.LAND, ownerIndex: 1, description: 'أرض مناسبة للاستثمار التجاري مع واجهة ممتازة على الشارع الرئيسي.', featured: false },
  { title: 'شقة للإيجار في الميدان', city: 'damascus', district: 'midan', area: 104, price: 470000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة مستأجرة مؤثثة جزئياً ومناسبة للعائلات الحديثة.', featured: false },
  { title: 'بيت عصري في يعفور', city: 'damascus', district: 'yafour', area: 255, price: 2330000000, type: Property_type.HOUSE, ownerIndex: 1, description: 'بيت حديث بنوافذ كبيرة ومطبخ مفتوح وموقف مغطى.', featured: true },
  { title: 'محل تجاري في ركن الدين', city: 'damascus', district: 'rukn al-din', area: 90, price: 820000000, type: Property_type.HOUSE, ownerIndex: 0, description: 'محل على واجهة شريفة مناسب للمتاجر الصغيرة والخدمات.', featured: false },
  { title: 'شقة مريحة في الشعلان', city: 'damascus', district: 'shaalaan', area: 123, price: 1440000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة مع غرفتي نوم ومصعد وموقع مناسب للسكن الدائم.', featured: false },
  { title: 'فيلا عائلية في البرامكة', city: 'damascus', district: 'baramkeh', area: 300, price: 2780000000, type: Property_type.VILLA, ownerIndex: 1, description: 'فيلا عائلية مع حديقة وموقفين ومرافق حديثة.', featured: true },
  { title: 'شقة جديدة في باب توما', city: 'damascus', district: 'bab touma', area: 112, price: 1250000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة مزودة بتركيب ذكي وموقع قريب من المراكز التاريخية.', featured: false },
  { title: 'استوديو في المزة', city: 'damascus', district: 'mazzeh', area: 69, price: 690000000, type: Property_type.STUDIO, ownerIndex: 0, description: 'استوديو أنيق ومناسب لذوي الاحتياجات السكنية المرنة.', featured: false },
  { title: 'شقة عائلية في قدسيا', city: 'rif dimashq', district: 'qudsaya', area: 162, price: 970000000, type: Property_type.APARTMENT, ownerIndex: 1, description: 'شقة عائلية ذات تقسيم عملي وتكلفة مناسبة.', featured: false },
  { title: 'بيت مستقل في جرمانا', city: 'rif dimashq', district: 'jaramana', area: 240, price: 1150000000, type: Property_type.HOUSE, ownerIndex: 2, description: 'بيت مستقل مع فناء داخلي وموقع ممتاز للراحة.', featured: false },
  { title: 'استوديو في صحنايا', city: 'rif dimashq', district: 'sahnaya', area: 54, price: 360000000, type: Property_type.STUDIO, ownerIndex: 0, description: 'استوديو مريح ومناسب للاستثمار أو السكن القصير.', featured: false },
  { title: 'فيلا فاخرة في العزيزية', city: 'aleppo', district: 'aziziyeh', area: 330, price: 1880000000, type: Property_type.VILLA, ownerIndex: 1, description: 'فيلا فاخرة بتصميم عصري ومرافق واسعة.', featured: true },
  { title: 'شقة في الحميدية', city: 'homs', district: 'al hamidiyah', area: 128, price: 700000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة حديثة مع مساحات جيدة وموقع مركزي.', featured: false },
  { title: 'شقة في الزراعة', city: 'latakia', district: 'ziraa', area: 134, price: 810000000, type: Property_type.APARTMENT, ownerIndex: 0, description: 'شقة جميلة مطلة على البحر مع إضاءة ممتازة.', featured: false },
  { title: 'بيت في الرمل طرطوس', city: 'tartous', district: 'al raml tartous', area: 220, price: 900000000, type: Property_type.HOUSE, ownerIndex: 1, description: 'بيت مريح قريب من الشاطئ ومناسب للعائلة.', featured: false },
  { title: 'شقة في الحاضر', city: 'hama', district: 'hader', area: 116, price: 530000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة ذات توزيع عملي وواجهات بسيطة ومناسبة.', featured: false },
  { title: 'أرض سكنية في المزة', city: 'damascus', district: 'mazzeh', area: 620, price: 1750000000, type: Property_type.LAND, ownerIndex: 0, description: 'أرض مميزة في المزة مناسبة لبناء بيت أو مشروع.', featured: false },
  { title: 'مكتب في أبو رمانة', city: 'damascus', district: 'abu rummaneh', area: 110, price: 1540000000, type: Property_type.APARTMENT, ownerIndex: 1, description: 'مكتب حديث ومناسب للشركات الصغيرة والمكاتب الإدارية.', featured: false },
  { title: 'شقة عصرية في المالكي', city: 'damascus', district: 'malki', area: 155, price: 2260000000, type: Property_type.APARTMENT, ownerIndex: 2, description: 'شقة فاخرة وراقية مع تشطيب فاخر وموقع ممتاز.', featured: true },
];

const APPOINTMENT_TEMPLATES = [
  { clientIndex: 4, propertyIndex: 0, date: '2026-07-10T10:00:00.000Z', status: AppointmentStatus.PENDING, notes: 'زيارة أولى للعميل' },
  { clientIndex: 4, propertyIndex: 2, date: '2026-07-11T12:00:00.000Z', status: AppointmentStatus.APPROVED, notes: 'مراجعة سعر وملف العقار' },
  { clientIndex: 5, propertyIndex: 4, date: '2026-07-12T15:00:00.000Z', status: AppointmentStatus.COMPLETED, notes: 'تمت الزيارة مع العميل' },
  { clientIndex: 5, propertyIndex: 7, date: '2026-07-13T09:30:00.000Z', status: AppointmentStatus.CANCELLED, notes: 'تم إلغاء الموعد' },
  { clientIndex: 6, propertyIndex: 10, date: '2026-07-14T11:00:00.000Z', status: AppointmentStatus.PENDING, notes: 'مراجعة فيلا' },
  { clientIndex: 6, propertyIndex: 11, date: '2026-07-15T16:00:00.000Z', status: AppointmentStatus.APPROVED, notes: 'زيارة استوديو' },
  { clientIndex: 4, propertyIndex: 18, date: '2026-07-16T10:30:00.000Z', status: AppointmentStatus.COMPLETED, notes: 'زيارة مكتب' },
  { clientIndex: 5, propertyIndex: 20, date: '2026-07-17T14:00:00.000Z', status: AppointmentStatus.PENDING, notes: 'عرض أولي' },
];

const INVOICE_TEMPLATES = [
  { clientIndex: 4, propertyIndex: 0, type: InvoiceType.SALE, total: 2150000000, tax: 21500000, status: InvoiceStatus.PAID, commission: 5, createdByIndex: 0, issueDays: 0, dueDays: 7 },
  { clientIndex: 5, propertyIndex: 1, type: InvoiceType.RENT, total: 950000000, tax: 9500000, status: InvoiceStatus.PAID, commission: 4.5, createdByIndex: 9, issueDays: 2, dueDays: 15 },
  { clientIndex: 6, propertyIndex: 2, type: InvoiceType.SALE, total: 3850000000, tax: 38500000, status: InvoiceStatus.OVERDUE, commission: 5, createdByIndex: 0, issueDays: 5, dueDays: 20 },
  { clientIndex: 4, propertyIndex: 6, type: InvoiceType.SALE, total: 2480000000, tax: 24800000, status: InvoiceStatus.PENDING, commission: 4, createdByIndex: 9, issueDays: 10, dueDays: 30 },
  { clientIndex: 5, propertyIndex: 10, type: InvoiceType.SALE, total: 2950000000, tax: 29500000, status: InvoiceStatus.CANCELLED, commission: 3.5, createdByIndex: 0, issueDays: 7, dueDays: 14 },
  { clientIndex: 6, propertyIndex: 16, type: InvoiceType.RENT, total: 700000000, tax: 7000000, status: InvoiceStatus.PAID, commission: 4, createdByIndex: 9, issueDays: 3, dueDays: 12 },
  { clientIndex: 4, propertyIndex: 19, type: InvoiceType.SERVICE, total: 180000000, tax: 1800000, status: InvoiceStatus.PENDING, commission: 2, createdByIndex: 9, issueDays: 1, dueDays: 10 },
];

const MAINTENANCE_TEMPLATES = [
  { propertyIndex: 0, clientIndex: 4, assignedIndex: 11, supplierIndex: 10, category: 'كهرباء', description: 'انقطاع في الكهرباء في المطبخ واللوحة الرئيسية.', priority: TicketPriority.HIGH, status: TicketStatus.OPEN },
  { propertyIndex: 1, clientIndex: 4, assignedIndex: 11, supplierIndex: 10, category: 'سباكة', description: 'تسريب ماء في الحمام الجنوبي.', priority: TicketPriority.MEDIUM, status: TicketStatus.IN_PROGRESS },
  { propertyIndex: 2, clientIndex: 5, assignedIndex: 11, supplierIndex: 10, category: 'دهان', description: 'تحتاج الجدران إلى دهان وإصلاحات طفيفة.', priority: TicketPriority.LOW, status: TicketStatus.COMPLETED },
  { propertyIndex: 6, clientIndex: 5, assignedIndex: 12, supplierIndex: 10, category: 'تكييف', description: 'توقف المكيف المركزي في الطابق الأول.', priority: TicketPriority.HIGH, status: TicketStatus.OPEN },
  { propertyIndex: 7, clientIndex: 6, assignedIndex: 12, supplierIndex: 10, category: 'أبواب ونوافذ', description: 'تحتاج أبواب الشقة إلى تعديل وتثبيت.', priority: TicketPriority.MEDIUM, status: TicketStatus.CANCELLED },
  { propertyIndex: 12, clientIndex: 6, assignedIndex: 12, supplierIndex: 10, category: 'كهرباء', description: 'تلف في نقطة الكهرباء في المطبخ.', priority: TicketPriority.HIGH, status: TicketStatus.IN_PROGRESS },
];

const NOTIFICATION_TEMPLATES = [
  { userIndex: 4, type: 'visit', title: 'موعد زيارة جديد', body: 'تم تحديد موعد زيارة جديد للعقار المقترح خلال يومين.' },
  { userIndex: 4, type: 'invoice', title: 'فاتورة مستحقة', body: 'لديك فاتورة جديدة بقيمة 950,000,000 ل.س.' },
  { userIndex: 5, type: 'maintenance', title: 'طلب صيانة', body: 'تم إنشاء طلب صيانة جديد للعقار الخاص بك.' },
  { userIndex: 1, type: 'property', title: 'عقار جديد', body: 'تم إضافة عقار جديد إلى قائمة ممتلكاتك.' },
  { userIndex: 9, type: 'payment', title: 'دفعة مستلمة', body: 'تم استلام دفعة جزئية من العميل بنجاح.' },
  { userIndex: 6, type: 'visit', title: 'موعد زيارة مؤكد', body: 'تم تأكيد الموعد مع الوكيل.' },
];

function toPropType(value: Property_type): Property_type {
  return value;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function ensureUser(definition: (typeof USER_DEFINITIONS)[number]) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email: definition.email },
    update: {
      fullName: definition.fullName,
      phone: definition.phone,
      role: definition.role,
      password: passwordHash,
      emailVerifiedAt: new Date(),
    },
    create: {
      fullName: definition.fullName,
      email: definition.email,
      phone: definition.phone,
      role: definition.role,
      password: passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
}

async function ensureDistrict(item: (typeof DISTRICTS)[number]) {
  return prisma.district.upsert({
    where: {
      nameEn_city: {
        nameEn: item.nameEn,
        city: item.city,
      },
    },
    update: {
      nameAr: item.nameAr,
      tier: item.tier,
      priceMultiplier: item.priceMultiplier,
      lat: item.lat,
      lng: item.lng,
      isOrganized: item.isOrganized,
    },
    create: {
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      city: item.city,
      tier: item.tier,
      priceMultiplier: item.priceMultiplier,
      lat: item.lat,
      lng: item.lng,
      isOrganized: item.isOrganized,
    },
  });
}

async function ensureProperty(template: (typeof PROPERTY_TEMPLATES)[number], ownerId: number) {
  const existing = await prisma.property.findFirst({
    where: {
      title: template.title,
      ownerId,
      city: template.city,
      address: template.title,
    },
  });

  if (existing) {
    return prisma.property.update({
      where: { id: existing.id },
      data: {
        description: template.description,
        area: template.area,
        price: template.price,
        type: toPropType(template.type),
        address: template.title,
      },
    });
  }

  return prisma.property.create({
    data: {
      ownerId,
      title: template.title,
      description: template.description,
      address: template.title,
      area: template.area,
      city: template.city,
      price: template.price,
      type: template.type,
    },
  });
}

async function seedPropertyImages(propertyId: number, index: number) {
  await prisma.propertyImage.deleteMany({ where: { propertyId } });
  const images = ROOM_TYPES.map((room, idx) => ({
    propertyId,
    url: ROOM_IMAGE_URLS[room][index % ROOM_IMAGE_URLS[room].length],
    room,
    caption: `${room} for property ${propertyId}`,
    sortOrder: idx + 1,
  }));

  await prisma.propertyImage.createMany({
    data: images,
  });

  const firstImage = images[0];
  await prisma.property.update({
    where: { id: propertyId },
    data: { image: firstImage.url },
  });
}

async function ensureAppointment(template: (typeof APPOINTMENT_TEMPLATES)[number], clientId: number, propertyId: number) {
  const existing = await prisma.appointment.findFirst({
    where: {
      clientId,
      propertyId,
      date: new Date(template.date),
    },
  });

  if (existing) {
    return prisma.appointment.update({
      where: { id: existing.id },
      data: {
        status: template.status,
        notes: template.notes,
      },
    });
  }

  return prisma.appointment.create({
    data: {
      clientId,
      propertyId,
      date: new Date(template.date),
      status: template.status,
      notes: template.notes,
    },
  });
}

async function ensureInvoice(template: (typeof INVOICE_TEMPLATES)[number], clientId: number, propertyId: number, createdById: number) {
  const existing = await prisma.invoice.findFirst({
    where: {
      clientId,
      propertyId,
      type: template.type,
    },
  });

  const issueDate = new Date();
  issueDate.setDate(issueDate.getDate() - template.issueDays);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + template.dueDays);

  if (existing) {
    return prisma.invoice.update({
      where: { id: existing.id },
      data: {
        totalAmount: template.total,
        tax: template.tax,
        status: template.status,
        issueDate,
        dueDate,
        createdBy: createdById,
        commissionPercentage: template.commission,
      },
    });
  }

  return prisma.invoice.create({
    data: {
      clientId,
      propertyId,
      type: template.type,
      totalAmount: template.total,
      tax: template.tax,
      issueDate,
      dueDate,
      status: template.status,
      createdBy: createdById,
      commissionPercentage: template.commission,
    },
  });
}

async function ensurePayment(invoiceId: number, amount: number, status: InvoiceStatus) {
  const existing = await prisma.payment.findFirst({ where: { invoiceId, amount } });
  if (existing) {
    return existing;
  }
  return prisma.payment.create({ data: { invoiceId, amount, date: new Date() } });
}

async function ensureCommission(invoiceId: number, amount: number, percentage: number) {
  const existing = await prisma.commission.findFirst({ where: { invoiceId } });
  if (existing) {
    return prisma.commission.update({
      where: { id: existing.id },
      data: { amount, percentage },
    });
  }
  return prisma.commission.create({ data: { invoiceId, amount, percentage } });
}

async function ensureMaintenance(template: (typeof MAINTENANCE_TEMPLATES)[number], propertyId: number, clientId: number, assignedToId: number, supplierId: number) {
  const existing = await prisma.maintenanceTicket.findFirst({
    where: {
      propertyId,
      clientId,
      category: template.category,
      description: template.description,
    },
  });

  if (existing) {
    return prisma.maintenanceTicket.update({
      where: { id: existing.id },
      data: {
        assignedTo: assignedToId,
        supplierId,
        priority: template.priority,
        status: template.status,
      },
    });
  }

  return prisma.maintenanceTicket.create({
    data: {
      propertyId,
      clientId,
      assignedTo: assignedToId,
      supplierId,
      category: template.category,
      description: template.description,
      priority: template.priority,
      status: template.status,
    },
  });
}

async function ensureNotification(template: (typeof NOTIFICATION_TEMPLATES)[number], userId: number) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: template.type,
      title: template.title,
      body: template.body,
    },
  });
  if (existing) {
    return existing;
  }
  return prisma.notification.create({ data: { userId, type: template.type, title: template.title, body: template.body } });
}

async function ensureMarketData() {
  const csvFiles = ['data/market-seed.csv', 'data/real-market.template.csv'];
  const fxRate = await prisma.fxRate.findFirst({ orderBy: { effective_at: 'desc' } });
  const fxValue = fxRate?.usd_to_syp ?? 130000;

  for (const relativePath of csvFiles) {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const content = await readFile(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;
    const headers = lines[0].split(',');
    for (const line of lines.slice(1)) {
      const values = line.split(',');
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });
      const city = (row.city ?? '').trim().toLowerCase();
      const district = (row.district ?? '').trim().toLowerCase();
      const propertyType = (row.property_type ?? '').trim().toLowerCase();
      const areaM2 = Number(row.area_m2 ?? 0);
      const priceSyp = Number(row.price_syp ?? 0);
      const priceUsd = Number(row.price_usd ?? 0);
      if (!city || !district || !propertyType || !Number.isFinite(areaM2) || areaM2 <= 0) continue;
      const computedPriceSyp = Number.isFinite(priceSyp) && priceSyp > 0 ? priceSyp : Math.round((Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : 0) * fxValue);
      const computedPriceUsd = Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : (computedPriceSyp > 0 ? computedPriceSyp / fxValue : 0);
      if (!computedPriceSyp || !computedPriceUsd) continue;
      const normalizedCity = city.replace(/\s+/g, ' ').trim();
      const normalizedDistrict = district.replace(/\s+/g, ' ').trim();
      const normalizedType = propertyType.replace(/\s+/g, ' ').trim();
      const ingestHash = hashValue(`${normalizedCity}|${normalizedDistrict}|${normalizedType}|${areaM2}|${computedPriceSyp}|${computedPriceUsd}|${row.source ?? 'seed'}`);
      await prisma.marketData.upsert({
        where: { ingest_hash: ingestHash },
        update: {
          city: normalizedCity,
          district: normalizedDistrict,
          property_type: normalizedType,
          area_m2: areaM2,
          price_syp: computedPriceSyp,
          price_usd: computedPriceUsd,
          price_per_m2_syp: computedPriceSyp / areaM2,
          price_per_m2: computedPriceUsd / areaM2,
          source: row.source ?? 'seed',
          source_name: row.source ?? 'seed',
          fx_usd_to_syp: fxValue,
          title: `${normalizedType} in ${normalizedDistrict}`,
          title_normalized: `${normalizedType} in ${normalizedDistrict}`,
          has_image: false,
          created_at: new Date(row.created_at || new Date().toISOString()),
        },
        create: {
          ingest_hash: ingestHash,
          city: normalizedCity,
          district: normalizedDistrict,
          property_type: normalizedType,
          area_m2: areaM2,
          price_syp: computedPriceSyp,
          price_usd: computedPriceUsd,
          price_per_m2_syp: computedPriceSyp / areaM2,
          price_per_m2: computedPriceUsd / areaM2,
          source: row.source ?? 'seed',
          source_name: row.source ?? 'seed',
          fx_usd_to_syp: fxValue,
          title: `${normalizedType} in ${normalizedDistrict}`,
          title_normalized: `${normalizedType} in ${normalizedDistrict}`,
          has_image: false,
          created_at: new Date(row.created_at || new Date().toISOString()),
        },
      });

      await prisma.areasPrice.upsert({
        where: {
          city_district_property_type: {
            city: normalizedCity,
            district: normalizedDistrict,
            property_type: normalizedType,
          },
        },
        update: {
          avg_price_per_m2: computedPriceUsd / areaM2,
          avg_price_per_m2_syp: computedPriceSyp / areaM2,
          sample_count: { increment: 1 },
          fx_usd_to_syp: fxValue,
          fx_source: 'seed',
        },
        create: {
          city: normalizedCity,
          district: normalizedDistrict,
          property_type: normalizedType,
          avg_price_per_m2: computedPriceUsd / areaM2,
          avg_price_per_m2_syp: computedPriceSyp / areaM2,
          sample_count: 1,
          fx_usd_to_syp: fxValue,
          fx_source: 'seed',
        },
      });
    }
  }
}

async function main() {
  const users = await Promise.all(USER_DEFINITIONS.map(ensureUser));
  await Promise.all(DISTRICTS.map(ensureDistrict));

  const ownerUsers = users.filter((user) => user.role === Role.OWNER);
  const adminUser = users.find((user) => user.role === Role.ADMIN);
  const agentUser = users.find((user) => user.role === Role.AGENT);
  const accountantUser = users.find((user) => user.role === Role.ACCOUNTANT);
  const supplierUser = users.find((user) => user.role === Role.SUPPLIER);
  const workerUsers = users.filter((user) => user.role === Role.WORKER);
  const clientUsers = users.filter((user) => user.role === Role.CLIENT);

  const createdProperties = [] as Array<{ id: number }>;
  for (const [index, template] of PROPERTY_TEMPLATES.entries()) {
    const owner = ownerUsers[index % ownerUsers.length];
    const property = await ensureProperty(template, owner.id);
    await seedPropertyImages(property.id, index);
    createdProperties.push(property);
  }

  for (const template of APPOINTMENT_TEMPLATES) {
    const client = clientUsers[template.clientIndex % clientUsers.length];
    const property = createdProperties[template.propertyIndex];
    if (client && property) {
      await ensureAppointment(template, client.id, property.id);
    }
  }

  for (const template of INVOICE_TEMPLATES) {
    const client = clientUsers[template.clientIndex % clientUsers.length];
    const property = createdProperties[template.propertyIndex];
    const creator = accountantUser ?? adminUser;
    if (client && property && creator) {
      const invoice = await ensureInvoice(template, client.id, property.id, creator.id);
      const fullAmount = Number(invoice.totalAmount ?? 0);
      const partialAmount = Math.round(fullAmount * 0.6);
      if (fullAmount > 0) {
        await ensurePayment(invoice.id, fullAmount, template.status);
        if (template.status === InvoiceStatus.PAID) {
          await ensurePayment(invoice.id, partialAmount, template.status);
        }
      }
      await ensureCommission(invoice.id, Math.round(fullAmount * (template.commission / 100)), template.commission);
    }
  }

  for (const template of MAINTENANCE_TEMPLATES) {
    const property = createdProperties[template.propertyIndex];
    const client = clientUsers[template.clientIndex % clientUsers.length];
    const assigned = workerUsers[0] ?? adminUser;
    const supplier = supplierUser;
    if (property && client && assigned && supplier) {
      await ensureMaintenance(template, property.id, client.id, assigned.id, supplier.id);
    }
  }

  for (const template of NOTIFICATION_TEMPLATES) {
    const user = users[template.userIndex];
    if (user) await ensureNotification(template, user.id);
  }

  await ensureMarketData();

  const counts = {
    users: await prisma.user.count(),
    properties: await prisma.property.count(),
    propertyImages: await prisma.propertyImage.count(),
    appointments: await prisma.appointment.count(),
    invoices: await prisma.invoice.count(),
    maintenanceTickets: await prisma.maintenanceTicket.count(),
    notifications: await prisma.notification.count(),
  };

  console.log('Seed summary');
  console.log(JSON.stringify(counts, null, 2));
  console.log('Note: schema does not include a dedicated property-to-agent relation, so agent assignments were represented through the workflow and appointments rather than a new column.');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
