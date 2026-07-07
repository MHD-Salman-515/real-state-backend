import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {
  AppointmentStatus,
  InvoiceStatus,
  InvoiceType,
  PrismaClient,
  Property_type,
  Role,
  RoomType,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = 'password123';

const ROOM_TYPES: RoomType[] = ['LIVING', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'EXTERIOR', 'BALCONY'];
const ROOM_IMAGE_URLS: Record<RoomType, string[]> = {
  LIVING: [
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80',
  ],
  BEDROOM: [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80',
  ],
  KITCHEN: [
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80',
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
  { nameAr: 'المزة - فيلات شرقية', nameEn: 'mazzeh villas east', city: 'damascus', tier: 'ultra', priceMultiplier: 1.38, lat: 33.502, lng: 36.258, isOrganized: true },
  { nameAr: 'كفرسوسة', nameEn: 'kafr sousa', city: 'damascus', tier: 'high', priceMultiplier: 1.18, lat: 33.4921, lng: 36.2734, isOrganized: true },
  { nameAr: 'مشروع دمر', nameEn: 'mashrou dummar', city: 'damascus', tier: 'high', priceMultiplier: 1.28, lat: 33.5312, lng: 36.2201, isOrganized: true },
  { nameAr: 'قدسيا', nameEn: 'qudsaya', city: 'rif dimashq', tier: 'high', priceMultiplier: 1.12, lat: 33.5512, lng: 36.2334, isOrganized: true },
  { nameAr: 'جرمانا', nameEn: 'jaramana', city: 'rif dimashq', tier: 'medium', priceMultiplier: 1.0, lat: 33.4812, lng: 36.3512, isOrganized: false },
  { nameAr: 'صحنايا', nameEn: 'sahnaya', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.83, lat: 33.4423, lng: 36.2334, isOrganized: false },
  { nameAr: 'باب توما', nameEn: 'bab touma', city: 'damascus', tier: 'medium', priceMultiplier: 1.03, lat: 33.5134, lng: 36.3098, isOrganized: true },
  { nameAr: 'الشعلان', nameEn: 'shaalaan', city: 'damascus', tier: 'ultra', priceMultiplier: 1.3, lat: 33.5072, lng: 36.2889, isOrganized: true },
  { nameAr: 'البرامكة', nameEn: 'baramkeh', city: 'damascus', tier: 'medium', priceMultiplier: 1.06, lat: 33.5034, lng: 36.3089, isOrganized: true },
  { nameAr: 'الميدان', nameEn: 'midan', city: 'damascus', tier: 'medium', priceMultiplier: 1.05, lat: 33.4934, lng: 36.3012, isOrganized: true },
  { nameAr: 'ركن الدين', nameEn: 'rukn al-din', city: 'damascus', tier: 'medium', priceMultiplier: 1.08, lat: 33.5289, lng: 36.2934, isOrganized: true },
  { nameAr: 'برزة', nameEn: 'barzeh', city: 'damascus', tier: 'medium', priceMultiplier: 1.02, lat: 33.5398, lng: 36.3134, isOrganized: true },
  { nameAr: 'الزاهرة', nameEn: 'zahera', city: 'damascus', tier: 'medium', priceMultiplier: 1.0, lat: 33.498, lng: 36.312, isOrganized: true },
  { nameAr: 'جوبر', nameEn: 'jobar', city: 'damascus', tier: 'low', priceMultiplier: 0.9, lat: 33.522, lng: 36.345, isOrganized: false },
  { nameAr: 'القدم', nameEn: 'kadam', city: 'damascus', tier: 'low', priceMultiplier: 0.88, lat: 33.479, lng: 36.303, isOrganized: false },
  { nameAr: 'الشاغور', nameEn: 'shaghour', city: 'damascus', tier: 'low', priceMultiplier: 0.85, lat: 33.506, lng: 36.315, isOrganized: false },
  { nameAr: 'المزرعة', nameEn: 'mazraa', city: 'damascus', tier: 'high', priceMultiplier: 1.15, lat: 33.506, lng: 36.275, isOrganized: true },
  { nameAr: 'المزة', nameEn: 'mazzeh', city: 'damascus', tier: 'high', priceMultiplier: 1.2, lat: 33.499, lng: 36.26, isOrganized: true },
  { nameAr: 'ببيلا', nameEn: 'babila', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.85, lat: 33.463, lng: 36.335, isOrganized: false },
  { nameAr: 'يلدا', nameEn: 'yalda', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.9, lat: 33.456, lng: 36.32, isOrganized: false },
  { nameAr: 'حرستا', nameEn: 'harasta', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.87, lat: 33.548, lng: 36.37, isOrganized: false },
  { nameAr: 'دوما', nameEn: 'douma', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.88, lat: 33.572, lng: 36.4, isOrganized: false },
  { nameAr: 'عدرا', nameEn: 'adra', city: 'rif dimashq', tier: 'low', priceMultiplier: 0.8, lat: 33.617, lng: 36.5, isOrganized: false },
  { nameAr: 'السيدة زينب', nameEn: 'sayyida zaynab', city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.95, lat: 33.438, lng: 36.337, isOrganized: true },
];

// 13 users — no AGENT role (not yet in DB enum at seed time)
const USER_DEFINITIONS = [
  { email: 'ahmad.khateeb@urbanex.sy',    fullName: 'أحمد الخطيب',              role: Role.ADMIN,      phone: '+963911234501' },
  { email: 'mohammad.zaabi@gmail.com',    fullName: 'محمد الزعبي',              role: Role.OWNER,      phone: '+963944123001' },
  { email: 'samer.ali.sy@gmail.com',      fullName: 'سامر العلي',               role: Role.OWNER,      phone: '+963933456002' },
  { email: 'rana.haddad@hotmail.com',     fullName: 'رنا حداد',                 role: Role.OWNER,      phone: '+963988567003' },
  { email: 'dima.yousef.sy@gmail.com',    fullName: 'ديما يوسف',                role: Role.CLIENT,     phone: '+963988901009' },
  { email: 'tarek.nabulsi@gmail.com',     fullName: 'طارق النابلسي',            role: Role.CLIENT,     phone: '+963911456010' },
  { email: 'sara.maraa@hotmail.com',      fullName: 'سارة مرعي',               role: Role.CLIENT,     phone: '+963955789011' },
  { email: 'hassan.qasem.work@gmail.com', fullName: 'حسان قاسم',               role: Role.WORKER,     phone: '+963988234015' },
  { email: 'eyad.trabelsi.w@gmail.com',   fullName: 'إياد طرابلسي',            role: Role.WORKER,     phone: '+963911567016' },
  { email: 'sham.maintenance@gmail.com',  fullName: 'شركة الشام للصيانة',       role: Role.SUPPLIER,   phone: '+963922234018' },
  { email: 'damascus.services@gmail.com', fullName: 'مؤسسة دمشق للخدمات',      role: Role.SUPPLIER,   phone: '+963944678019' },
  { email: 'reem.atassi@urbanex.sy',      fullName: 'ريم الأتاسي',              role: Role.ACCOUNTANT, phone: '+963988456021' },
  { email: 'ziad.buni@urbanex.sy',        fullName: 'زياد البني',               role: Role.ACCOUNTANT, phone: '+963911890022' },
];

// 25 real Syrian listings from Doushesh.com
// ownerIndex → ownerUsers[index % ownerUsers.length]
const PROPERTY_TEMPLATES = [
  {
    title: 'شقة للبيع في ببيلا 130م² غرفتين طابق أرضي',
    description: 'شقة للبيع في منطقة ببيلا بريف دمشق، مساحة 130م²، غرفتين نوم، صالة، طابق أرضي، موقع مميز بالقرب من الخدمات.',
    city: 'ريف دمشق', address: 'ببيلا', area: 130, price: 65000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
  {
    title: 'منزل في دمشق المزة موقع مميز وإطلالة رائعة',
    description: 'منزل في المزة - فيلات شرقية، مساحة 220م²، 4 غرف نوم، موقع مميز، إطلالة رائعة على الحديقة.',
    city: 'دمشق', address: 'فيلات شرقية', area: 220, price: 220000, type: Property_type.HOUSE, ownerIndex: 1,
  },
  {
    title: 'للبيع شقة في السبع بحرات 146م طابو أخضر',
    description: 'شقة للبيع في منطقة السبع بحرات - المزرعة، مساحة 146م²، طابو أخضر، 3 غرف نوم، طابق ثالث مع مصعد.',
    city: 'دمشق', address: 'المزرعة', area: 146, price: 275000, type: Property_type.APARTMENT, ownerIndex: 2,
  },
  {
    title: 'شقة 80م² في المزة فيلات شرقية غرفتين وصالة',
    description: 'شقة 80م² في المزة فيلات شرقية، غرفتين نوم وصالة، تشطيب ممتاز، طابق ثاني، مصعد.',
    city: 'دمشق', address: 'فيلات شرقية', area: 80, price: 220000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
  {
    title: 'شقة في جرمانا 100م² غرفتين',
    description: 'شقة في جرمانا، مساحة 100م²، غرفتين نوم، صالة، مطبخ، حمامين، طابق ثالث.',
    city: 'ريف دمشق', address: 'جرمانا', area: 100, price: 55000, type: Property_type.APARTMENT, ownerIndex: 1,
  },
  {
    title: 'منزل مستقل في قدسيا 250م²',
    description: 'منزل مستقل في قدسيا، مساحة 250م²، 3 غرف نوم، حديقة صغيرة، موقف سيارات، بئر ماء خاص.',
    city: 'ريف دمشق', address: 'قدسيا', area: 250, price: 180000, type: Property_type.HOUSE, ownerIndex: 2,
  },
  {
    title: 'شقة فاخرة في المالكي 200م² تشطيب سوبر لوكس',
    description: 'شقة فاخرة في المالكي، مساحة 200م²، تشطيب سوبر ديلوكس، 4 غرف نوم، 3 حمامات، مطبخ مفتوح، شرفة واسعة.',
    city: 'دمشق', address: 'المالكي', area: 200, price: 450000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
  {
    title: 'شقة في برزة 90م² طابق ثاني مصعد',
    description: 'شقة في برزة، مساحة 90م²، طابق ثاني، مصعد، غرفتين نوم، صالة، مطبخ، حمامين.',
    city: 'دمشق', address: 'برزة', area: 90, price: 48000, type: Property_type.APARTMENT, ownerIndex: 1,
  },
  {
    title: 'فيلا في يلدا 350م² مع حديقة',
    description: 'فيلا في يلدا بريف دمشق، مساحة 350م²، حديقة خاصة واسعة، 5 غرف نوم، 3 حمامات، مرآب سيارتين.',
    city: 'ريف دمشق', address: 'يلدا', area: 350, price: 320000, type: Property_type.VILLA, ownerIndex: 2,
  },
  {
    title: 'شقة في الميدان 75م² غرفة وصالة',
    description: 'شقة في الميدان بدمشق، مساحة 75م²، غرفة نوم وصالة، مطبخ، حمام، طابق ثالث.',
    city: 'دمشق', address: 'الميدان', area: 75, price: 35000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
  {
    title: 'شقة في دوما 110م² 3 غرف',
    description: 'شقة في دوما بريف دمشق، مساحة 110م²، 3 غرف نوم، صالة، مطبخ، حمامين، طابق ثاني.',
    city: 'ريف دمشق', address: 'دوما', area: 110, price: 42000, type: Property_type.APARTMENT, ownerIndex: 1,
  },
  {
    title: 'منزل في المزة 86 شارع رئيسي 180م²',
    description: 'منزل في المزة على شارع 86 الرئيسي، مساحة 180م²، 4 غرف نوم، موقع ممتاز قرب الخدمات والمدارس.',
    city: 'دمشق', address: 'المزة', area: 180, price: 195000, type: Property_type.HOUSE, ownerIndex: 2,
  },
  {
    title: 'شقة في كفرسوسة 120م² تشطيب راقي',
    description: 'شقة في كفرسوسة بدمشق، مساحة 120م²، تشطيب راقي، 3 غرف نوم، مصعد، موقف سيارة.',
    city: 'دمشق', address: 'كفرسوسة', area: 120, price: 130000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
  {
    title: 'شقة في ركن الدين 95م² 3 غرف',
    description: 'شقة في ركن الدين بدمشق، مساحة 95م²، 3 غرف نوم، صالة، مطبخ، طابق رابع، مصعد.',
    city: 'دمشق', address: 'ركن الدين', area: 95, price: 65000, type: Property_type.APARTMENT, ownerIndex: 1,
  },
  {
    title: 'فيلا في قدسيا 400م² مسبح',
    description: 'فيلا فاخرة في قدسيا بريف دمشق، مساحة 400م²، مسبح خاص، 6 غرف نوم، 4 حمامات، حديقة واسعة.',
    city: 'ريف دمشق', address: 'قدسيا', area: 400, price: 580000, type: Property_type.VILLA, ownerIndex: 2,
  },
  {
    title: 'شقة في حرستا 85م² طابق أول',
    description: 'شقة في حرستا بريف دمشق، مساحة 85م²، طابق أول، غرفتين نوم وصالة، مطبخ، حمامين.',
    city: 'ريف دمشق', address: 'حرستا', area: 85, price: 38000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
  {
    title: 'شقة في جوبر 70م² غرفتين',
    description: 'شقة في جوبر بدمشق، مساحة 70م²، غرفتين نوم، صالة، مطبخ، حمام، طابق ثاني.',
    city: 'دمشق', address: 'جوبر', area: 70, price: 32000, type: Property_type.APARTMENT, ownerIndex: 1,
  },
  {
    title: 'منزل في صحنايا 220م² أرضي مع حديقة',
    description: 'منزل في صحنايا بريف دمشق، مساحة 220م²، طابق أرضي، حديقة واسعة، 4 غرف نوم، بئر ماء.',
    city: 'ريف دمشق', address: 'صحنايا', area: 220, price: 145000, type: Property_type.HOUSE, ownerIndex: 2,
  },
  {
    title: 'شقة في أبو رمانة 160م² فاخرة',
    description: 'شقة فاخرة في أبو رمانة بدمشق، مساحة 160م²، 4 غرف نوم، تشطيب لوكس، طابق خامس، مصعد.',
    city: 'دمشق', address: 'أبو رمانة', area: 160, price: 380000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
  {
    title: 'شقة في الزاهرة 88م² طابق ثالث',
    description: 'شقة في الزاهرة بدمشق، مساحة 88م²، طابق ثالث، غرفتين نوم وصالة، مطبخ، حمامين.',
    city: 'دمشق', address: 'الزاهرة', area: 88, price: 52000, type: Property_type.APARTMENT, ownerIndex: 1,
  },
  {
    title: 'شقة في المزة 95م² 3 غرف مصعد',
    description: 'شقة في المزة بدمشق، مساحة 95م²، 3 غرف نوم، مصعد، طابق خامس، تشطيب جيد.',
    city: 'دمشق', address: 'المزة', area: 95, price: 98000, type: Property_type.APARTMENT, ownerIndex: 2,
  },
  {
    title: 'منزل في عدرا 200م² طابقين',
    description: 'منزل في عدرا بريف دمشق، مساحة 200م²، طابقين، 4 غرف نوم، فناء خارجي، مرآب سيارة.',
    city: 'ريف دمشق', address: 'عدرا', area: 200, price: 88000, type: Property_type.HOUSE, ownerIndex: 0,
  },
  {
    title: 'شقة في القدم 80م² غرفتين',
    description: 'شقة في القدم بدمشق، مساحة 80م²، غرفتين نوم، صالة، مطبخ، حمام، طابق ثالث.',
    city: 'دمشق', address: 'القدم', area: 80, price: 28000, type: Property_type.APARTMENT, ownerIndex: 1,
  },
  {
    title: 'فيلا في السيدة زينب 300م²',
    description: 'فيلا في السيدة زينب بريف دمشق، مساحة 300م²، 5 غرف نوم، 3 حمامات، حديقة، مرآب سيارتين.',
    city: 'ريف دمشق', address: 'السيدة زينب', area: 300, price: 210000, type: Property_type.VILLA, ownerIndex: 2,
  },
  {
    title: 'شقة في الشاغور 65م² غرفة',
    description: 'شقة في الشاغور بدمشق، مساحة 65م²، غرفة نوم وصالة، مطبخ، حمام، طابق ثاني.',
    city: 'دمشق', address: 'الشاغور', area: 65, price: 22000, type: Property_type.APARTMENT, ownerIndex: 0,
  },
];

// clientIndex → clientUsers[index % clientUsers.length]
const APPOINTMENT_TEMPLATES = [
  { clientIndex: 0, propertyIndex: 0,  date: '2026-07-10T10:00:00.000Z', status: AppointmentStatus.PENDING,   notes: 'زيارة أولى للشقة في ببيلا' },
  { clientIndex: 0, propertyIndex: 6,  date: '2026-07-11T12:00:00.000Z', status: AppointmentStatus.APPROVED,  notes: 'مراجعة شقة المالكي الفاخرة' },
  { clientIndex: 1, propertyIndex: 8,  date: '2026-07-12T15:00:00.000Z', status: AppointmentStatus.COMPLETED, notes: 'تمت زيارة الفيلا في يلدا بنجاح' },
  { clientIndex: 1, propertyIndex: 14, date: '2026-07-13T09:30:00.000Z', status: AppointmentStatus.CANCELLED, notes: 'تم إلغاء موعد زيارة فيلا قدسيا' },
  { clientIndex: 2, propertyIndex: 18, date: '2026-07-14T11:00:00.000Z', status: AppointmentStatus.PENDING,   notes: 'زيارة شقة أبو رمانة الفاخرة' },
];

// 2 SALE PAID, 1 SERVICE PAID — clientIndex → clientUsers
const INVOICE_TEMPLATES = [
  { clientIndex: 0, propertyIndex: 6,  type: InvoiceType.SALE,    total: 450000, tax: 4500, status: InvoiceStatus.PAID,    commission: 5,   issueDays: 2, dueDays: 7 },
  { clientIndex: 1, propertyIndex: 14, type: InvoiceType.SALE,    total: 580000, tax: 5800, status: InvoiceStatus.PAID,    commission: 5,   issueDays: 5, dueDays: 14 },
  { clientIndex: 2, propertyIndex: 1,  type: InvoiceType.SERVICE, total: 3500,   tax: 35,   status: InvoiceStatus.PAID,    commission: 2,   issueDays: 1, dueDays: 7 },
];

const MAINTENANCE_TEMPLATES = [
  { propertyIndex: 0,  clientIndex: 0, category: 'كهرباء',    description: 'انقطاع في لوحة الكهرباء الرئيسية في الشقة.', priority: TicketPriority.HIGH,   status: TicketStatus.OPEN },
  { propertyIndex: 4,  clientIndex: 1, category: 'سباكة',     description: 'تسريب ماء في الحمام الرئيسي.',               priority: TicketPriority.MEDIUM, status: TicketStatus.IN_PROGRESS },
  { propertyIndex: 11, clientIndex: 2, category: 'دهان',      description: 'تحتاج الجدران الداخلية إلى إعادة دهان.',      priority: TicketPriority.LOW,    status: TicketStatus.COMPLETED },
];

const NOTIFICATION_TEMPLATES = [
  { userIndex: 4,  type: 'visit',       title: 'موعد زيارة جديد',   body: 'تم تحديد موعد زيارة لشقة ببيلا.' },
  { userIndex: 5,  type: 'invoice',     title: 'فاتورة مستحقة',     body: 'لديك فاتورة جديدة بقيمة 580,000$.' },
  { userIndex: 6,  type: 'maintenance', title: 'طلب صيانة',         body: 'تم إنشاء طلب صيانة لعقارك في جرمانا.' },
  { userIndex: 1,  type: 'property',    title: 'عقار جديد',         body: 'تم إضافة عقار جديد إلى قائمة ممتلكاتك.' },
  { userIndex: 11, type: 'payment',     title: 'دفعة مستلمة',       body: 'تم استلام دفعة من العميل بنجاح.' },
  { userIndex: 6,  type: 'visit',       title: 'موعد مؤكد',         body: 'تم تأكيد موعد زيارة شقة أبو رمانة.' },
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
    where: { nameEn_city: { nameEn: item.nameEn, city: item.city } },
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
    where: { title: template.title, ownerId, city: template.city },
  });

  if (existing) {
    return prisma.property.update({
      where: { id: existing.id },
      data: {
        description: template.description,
        address: template.address,
        area: template.area,
        price: template.price,
        type: toPropType(template.type),
      },
    });
  }

  return prisma.property.create({
    data: {
      ownerId,
      title: template.title,
      description: template.description,
      address: template.address,
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
    caption: `${room} — property ${propertyId}`,
    sortOrder: idx + 1,
  }));

  await prisma.propertyImage.createMany({ data: images });

  await prisma.property.update({
    where: { id: propertyId },
    data: { image: images[0].url },
  });
}

async function ensureAppointment(
  template: (typeof APPOINTMENT_TEMPLATES)[number],
  clientId: number,
  propertyId: number,
) {
  const existing = await prisma.appointment.findFirst({
    where: { clientId, propertyId, date: new Date(template.date) },
  });

  if (existing) {
    return prisma.appointment.update({
      where: { id: existing.id },
      data: { status: template.status, notes: template.notes },
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

async function ensureInvoice(
  template: (typeof INVOICE_TEMPLATES)[number],
  clientId: number,
  propertyId: number,
  createdById: number,
) {
  const existing = await prisma.invoice.findFirst({
    where: { clientId, propertyId, type: template.type },
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

async function ensurePayment(invoiceId: number, amount: number) {
  const existing = await prisma.payment.findFirst({ where: { invoiceId, amount } });
  if (existing) return existing;
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

async function ensureMaintenance(
  template: (typeof MAINTENANCE_TEMPLATES)[number],
  propertyId: number,
  clientId: number,
  assignedToId: number,
  supplierId: number,
) {
  const existing = await prisma.maintenanceTicket.findFirst({
    where: { propertyId, clientId, category: template.category, description: template.description },
  });

  if (existing) {
    return prisma.maintenanceTicket.update({
      where: { id: existing.id },
      data: { assignedTo: assignedToId, supplierId, priority: template.priority, status: template.status },
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
    where: { userId, type: template.type, title: template.title },
  });
  if (existing) return existing;
  return prisma.notification.create({
    data: { userId, type: template.type, title: template.title, body: template.body },
  });
}

async function ensureMarketData() {
  const csvFiles = ['data/market-seed.csv', 'data/real-market.template.csv'];
  const fxRate = await prisma.fxRate.findFirst({ orderBy: { effective_at: 'desc' } });
  const fxValue = fxRate?.usd_to_syp ?? 130000;

  for (const relativePath of csvFiles) {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    let content: string;
    try {
      content = await readFile(absolutePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;
    const headers = lines[0].split(',');
    for (const line of lines.slice(1)) {
      const values = line.split(',');
      const row: Record<string, string> = {};
      headers.forEach((header, index) => { row[header] = values[index] ?? ''; });
      const city = (row.city ?? '').trim().toLowerCase();
      const district = (row.district ?? '').trim().toLowerCase();
      const propertyType = (row.property_type ?? '').trim().toLowerCase();
      const areaM2 = Number(row.area_m2 ?? 0);
      const priceSyp = Number(row.price_syp ?? 0);
      const priceUsd = Number(row.price_usd ?? 0);
      if (!city || !district || !propertyType || !Number.isFinite(areaM2) || areaM2 <= 0) continue;
      const computedPriceSyp = Number.isFinite(priceSyp) && priceSyp > 0
        ? priceSyp
        : Math.round((Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : 0) * fxValue);
      const computedPriceUsd = Number.isFinite(priceUsd) && priceUsd > 0
        ? priceUsd
        : computedPriceSyp > 0 ? computedPriceSyp / fxValue : 0;
      if (!computedPriceSyp || !computedPriceUsd) continue;
      const normalizedCity = city.replace(/\s+/g, ' ').trim();
      const normalizedDistrict = district.replace(/\s+/g, ' ').trim();
      const normalizedType = propertyType.replace(/\s+/g, ' ').trim();
      const ingestHash = hashValue(
        `${normalizedCity}|${normalizedDistrict}|${normalizedType}|${areaM2}|${computedPriceSyp}|${computedPriceUsd}|${row.source ?? 'seed'}`,
      );
      await prisma.marketData.upsert({
        where: { ingest_hash: ingestHash },
        update: {
          city: normalizedCity, district: normalizedDistrict, property_type: normalizedType,
          area_m2: areaM2, price_syp: computedPriceSyp, price_usd: computedPriceUsd,
          price_per_m2_syp: computedPriceSyp / areaM2, price_per_m2: computedPriceUsd / areaM2,
          source: row.source ?? 'seed', source_name: row.source ?? 'seed',
          fx_usd_to_syp: fxValue, title: `${normalizedType} in ${normalizedDistrict}`,
          title_normalized: `${normalizedType} in ${normalizedDistrict}`, has_image: false,
          created_at: new Date(row.created_at || new Date().toISOString()),
        },
        create: {
          ingest_hash: ingestHash, city: normalizedCity, district: normalizedDistrict,
          property_type: normalizedType, area_m2: areaM2, price_syp: computedPriceSyp,
          price_usd: computedPriceUsd, price_per_m2_syp: computedPriceSyp / areaM2,
          price_per_m2: computedPriceUsd / areaM2, source: row.source ?? 'seed',
          source_name: row.source ?? 'seed', fx_usd_to_syp: fxValue,
          title: `${normalizedType} in ${normalizedDistrict}`,
          title_normalized: `${normalizedType} in ${normalizedDistrict}`, has_image: false,
          created_at: new Date(row.created_at || new Date().toISOString()),
        },
      });

      await prisma.areasPrice.upsert({
        where: { city_district_property_type: { city: normalizedCity, district: normalizedDistrict, property_type: normalizedType } },
        update: {
          avg_price_per_m2: computedPriceUsd / areaM2,
          avg_price_per_m2_syp: computedPriceSyp / areaM2,
          sample_count: { increment: 1 },
          fx_usd_to_syp: fxValue,
          fx_source: 'seed',
        },
        create: {
          city: normalizedCity, district: normalizedDistrict, property_type: normalizedType,
          avg_price_per_m2: computedPriceUsd / areaM2,
          avg_price_per_m2_syp: computedPriceSyp / areaM2,
          sample_count: 1, fx_usd_to_syp: fxValue, fx_source: 'seed',
        },
      });
    }
  }
}

async function main() {
  const users = await Promise.all(USER_DEFINITIONS.map(ensureUser));
  await Promise.all(DISTRICTS.map(ensureDistrict));

  const ownerUsers    = users.filter((u) => u.role === Role.OWNER);
  const adminUser     = users.find((u) => u.role === Role.ADMIN)!;
  const accountantUser = users.find((u) => u.role === Role.ACCOUNTANT);
  const supplierUser  = users.find((u) => u.role === Role.SUPPLIER);
  const workerUsers   = users.filter((u) => u.role === Role.WORKER);
  const clientUsers   = users.filter((u) => u.role === Role.CLIENT);

  const createdProperties: Array<{ id: number }> = [];
  for (const [index, template] of PROPERTY_TEMPLATES.entries()) {
    const owner = ownerUsers[template.ownerIndex % ownerUsers.length];
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
      if (fullAmount > 0) {
        await ensurePayment(invoice.id, fullAmount);
        if (template.status === InvoiceStatus.PAID) {
          await ensurePayment(invoice.id, Math.round(fullAmount * 0.5));
        }
      }
      await ensureCommission(
        invoice.id,
        Math.round(fullAmount * (template.commission / 100)),
        template.commission,
      );
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

  try {
    await ensureMarketData();
  } catch (e: unknown) {
    console.log('Market data skipped (table may not exist yet):', e instanceof Error ? e.message : String(e));
  }

  const counts = {
    users:             await prisma.user.count(),
    properties:        await prisma.property.count(),
    propertyImages:    await prisma.propertyImage.count(),
    appointments:      await prisma.appointment.count(),
    invoices:          await prisma.invoice.count(),
    payments:          await prisma.payment.count(),
    commissions:       await prisma.commission.count(),
    maintenanceTickets: await prisma.maintenanceTicket.count(),
    notifications:     await prisma.notification.count(),
  };

  console.log('Seed complete');
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
