// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// نستخدم أسماء الرولز كـ string: 'ADMIN' | 'ACCOUNTANT' | ...
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
