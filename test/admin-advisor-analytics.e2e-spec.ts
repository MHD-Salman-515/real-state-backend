import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AdminAdvisorService } from '../src/admin-advisor/admin-advisor.service';
import { AdminAdvisorController } from '../src/admin-advisor/admin-advisor.controller';

describe('Admin Advisor Analytics (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const adminAnalyticsMock = {
    getAnalytics: jest.fn().mockResolvedValue({
      days: 7,
      totals: {
        suggestions: 12,
        accepted_optimal: 5,
        accepted_fast: 2,
        edited: 3,
        ignored: 1,
      },
    }),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AdminAdvisorController],
      providers: [
        JwtStrategy,
        RolesGuard,
        {
          provide: AdminAdvisorService,
          useValue: adminAnalyticsMock,
        },
      ],
    })
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without token', async () => {
    await request(app.getHttpServer()).get('/admin/advisor/analytics').expect(401);
  });

  it('returns 403 with non-admin token', async () => {
    const token = await jwtService.signAsync({
      sub: 10,
      email: 'owner@test.local',
      role: 'OWNER',
    });

    await request(app.getHttpServer())
      .get('/admin/advisor/analytics')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 200 with admin token and expected numeric response shape', async () => {
    const token = await jwtService.signAsync({
      sub: 1,
      email: 'admin@test.local',
      role: 'ADMIN',
    });

    const response = await request(app.getHttpServer())
      .get('/admin/advisor/analytics?days=7')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      days: expect.any(Number),
      totals: {
        suggestions: expect.any(Number),
        accepted_optimal: expect.any(Number),
        accepted_fast: expect.any(Number),
        edited: expect.any(Number),
        ignored: expect.any(Number),
      },
    });
    expect(adminAnalyticsMock.getAnalytics).toHaveBeenCalledWith(7);
  });
});
