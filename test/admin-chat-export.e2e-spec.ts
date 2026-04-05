import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AdminChatController } from './admin-chat.controller';
import { AdminChatService } from './admin-chat.service';

describe('AdminChatController', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const adminChatMock = {
    exportRows: jest.fn().mockResolvedValue([
      {
        session_id: 1,
        owner_id: 12,
        role: 'ASSISTANT',
        intent: 'PORTFOLIO',
        payload_json: '{}',
        content: 'text',
        created_at: new Date().toISOString(),
        outcome_action: null,
      },
    ]),
    ragDump: jest.fn().mockResolvedValue([
      {
        id: '1:1',
        text: 'ASSISTANT: text',
        metadata: {
          owner_id: 12,
          session_id: 1,
          intent: 'PORTFOLIO',
          created_at: new Date().toISOString(),
        },
      },
    ]),
    toCsv: jest.fn().mockReturnValue('session_id,owner_id\n1,12'),
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
      controllers: [AdminChatController],
      providers: [
        JwtStrategy,
        RolesGuard,
        {
          provide: AdminChatService,
          useValue: adminChatMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without token', async () => {
    await request(app.getHttpServer()).get('/admin/chat/export').expect(401);
  });

  it('returns 403 with non-admin token', async () => {
    const token = await jwtService.signAsync({
      sub: 10,
      email: 'owner@test.local',
      role: 'OWNER',
    });

    await request(app.getHttpServer())
      .get('/admin/chat/export?days=30')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 200 with admin token and expected shape', async () => {
    const token = await jwtService.signAsync({
      sub: 1,
      email: 'admin@test.local',
      role: 'ADMIN',
    });

    const response = await request(app.getHttpServer())
      .get('/admin/chat/export?days=30&format=json')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      days: 30,
      rows: expect.any(Array),
    });
  });
});
