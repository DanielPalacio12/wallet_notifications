import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthController } from './infrastructure/http/health.controller';
import { NotificationsModule } from './infrastructure/notifications.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
