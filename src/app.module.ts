import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PropertyModule } from './property/property.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { TicketsModule } from './tickets/tickets.module';
import { TicketLogsModule } from './ticket-logs/ticket-logs.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InvoicesModule } from './invoices/invoices.module';
import { CommissionsModule } from './commissions/commissions.module';
import { PaymentsModule } from './payments/payments.module';
import { AdvisorModule } from './advisor/advisor.module';
import { HealthModule } from './health/health.module';
import { AdminAdvisorModule } from './admin-advisor/admin-advisor.module';
import { AdminMarketModule } from './admin-market/admin-market.module';
import { OwnerChatModule } from './owner-chat/owner-chat.module';
import { AdminChatModule } from './admin-chat/admin-chat.module';
import { AiModule } from './ai/ai.module';
import { AdminExternalMarketModule } from './admin-external-market/admin-external-market.module';
import { BuyerChatModule } from './buyer-chat/buyer-chat.module';
import { MarketIntelligenceModule } from './market-intelligence/market-intelligence.module';
import { BuyerSavedSearchModule } from './buyer-saved-search/buyer-saved-search.module';
import { BuyerHistoryModule } from './buyer-history/buyer-history.module';
import { DebugModule } from './debug/debug.module';
import { OpsModule } from './ops/ops.module';
import { MarketDataModule } from './market-data/market-data.module';
import { AuthLoginTraceMiddleware } from './auth/auth-login-trace.middleware';
@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 30,
      },
    ]),
    UsersModule,
    AuthModule,
    PropertyModule,
    AppointmentsModule,
    TicketsModule,
    TicketLogsModule,
    ExpensesModule,
    InvoicesModule,
    PaymentsModule,
    CommissionsModule,
    AdvisorModule,
    HealthModule,
    AdminAdvisorModule,
    AdminMarketModule,
    OwnerChatModule,
    AdminChatModule,
    AiModule,
    AdminExternalMarketModule,
    BuyerChatModule,
    BuyerSavedSearchModule,
    BuyerHistoryModule,
    MarketIntelligenceModule,
    MarketDataModule,
    DebugModule,
    OpsModule,
  ],
  providers: [AuthLoginTraceMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthLoginTraceMiddleware)
      .forRoutes(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'api/auth/login', method: RequestMethod.POST },
      );
  }
}
