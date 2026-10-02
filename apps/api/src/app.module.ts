import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/config.module';
import { ContentModule } from './content/content.module';
import { EventsModule } from './events/events.module';
import { FamilyModule } from './family/family.module';
import { GameModule } from './game/game.module';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressionModule } from './progression/progression.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        // Limite globale généreuse ; les routes sensibles (connexion, PIN) ont leurs propres limites.
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        storage: redis.enabled ? new ThrottlerStorageRedisService(redis.createClient()) : undefined,
      }),
    }),
    AuditModule,
    EventsModule,
    ContentModule,
    JobsModule,
    RealtimeModule,
    AuthModule,
    ProgressionModule,
    FamilyModule,
    GameModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
