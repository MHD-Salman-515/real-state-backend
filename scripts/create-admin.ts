import 'dotenv/config';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_FULL_NAME = 'Salman Admin';
const ADMIN_EMAIL = 'syade082@gmail.com';
const ADMIN_PASSWORD = 'syade082';
const ADMIN_PHONE = '+963938411333';
const LEGACY_CHECK_EMAIL = 'sayde082@gmai.com';

function buildUserData(passwordHash: string) {
  const userModel = Prisma.dmmf.datamodel.models.find((model) => model.name === 'User');
  const fieldNames = new Set(userModel?.fields.map((field) => field.name) ?? []);

  const data: Record<string, unknown> = {
    fullName: ADMIN_FULL_NAME,
    email: ADMIN_EMAIL,
    phone: ADMIN_PHONE,
    password: passwordHash,
    role: Role.ADMIN,
  };

  if (fieldNames.has('active')) data.active = true;
  if (fieldNames.has('isActive')) data.isActive = true;
  if (fieldNames.has('verified')) data.verified = true;
  if (fieldNames.has('isVerified')) data.isVerified = true;
  if (fieldNames.has('emailVerified')) data.emailVerified = true;

  return data;
}

async function main() {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: LEGACY_CHECK_EMAIL }, { email: ADMIN_EMAIL }],
    },
  });

  if (existingUser) {
    console.log('Admin already exists');
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const data = buildUserData(passwordHash);

  await prisma.user.create({
    data: data as Prisma.UserCreateInput,
  });

  console.log(`Admin created: ${ADMIN_EMAIL}`);
}

main()
  .catch((error) => {
    console.error('Failed to create admin:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
