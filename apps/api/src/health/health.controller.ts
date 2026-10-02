import { Controller, Get, Inject } from '@nestjs/common';
import { isLocalDatabaseUrl, isLocalRedisUrl } from '@mimo/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { QueueService } from '../jobs/queue.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      queue: this.queue.driver,
      // Utilisé par le garde-fou des E2E : « local » ou « remote », jamais l'hôte lui-même.
      database: isLocalDatabaseUrl(this.config.databaseUrl) ? 'local' : 'remote',
      redis: !this.config.redisUrl
        ? 'none'
        : isLocalRedisUrl(this.config.redisUrl)
          ? 'local'
          : 'remote',
      time: new Date().toISOString(),
    };
  }
}
