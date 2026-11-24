import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts';
import { AuthModule } from './auth/auth.module';
import { BudgetsModule } from './budgets/budgets';
import { CategoriesModule } from './categories/categories';
import { Public, SessionGuard } from './common/auth';
import { DataModule } from './data/data';
import { DatabaseModule } from './db/database.module';
import { DatabaseService } from './db/database.service';
import { GoalsModule } from './goals/goals';
import { InsightsModule } from './insights/insights';
import { RecurringModule } from './recurring/recurring';
import { TransactionsModule } from './transactions/transactions';

@Controller('health')
class HealthController {
  constructor(private db: DatabaseService) {}
  @Public() @Get()
  health() {
    this.db.get('SELECT 1');
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule, AuthModule, AccountsModule, CategoriesModule, TransactionsModule,
    BudgetsModule, GoalsModule, RecurringModule, InsightsModule, DataModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
