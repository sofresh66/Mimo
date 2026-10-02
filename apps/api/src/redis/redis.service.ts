import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/env';

/**
 * Accès Redis optionnel. Sans REDIS_URL, `enabled` vaut false et les services
 * dépendants (files de tâches, rate limiting, adaptateur Socket.IO) utilisent
 * leur implémentation en mémoire — pratique en développement, déconseillé en production.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly clients: Redis[] = [];
  readonly enabled: boolean;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.enabled = Boolean(config.redisUrl);
    if (!this.enabled) {
      this.logger.warn('REDIS_URL non défini : files et rate limiting en mémoire (mono-instance)');
    }
  }

  /** Crée une nouvelle connexion (BullMQ exige des connexions dédiées). */
  createClient(options: RedisOptions = {}): Redis {
    if (!this.config.redisUrl) throw new Error('Redis désactivé');
    const client = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null, ...options });
    client.on('error', (error) => this.logger.error(`Redis : ${error.message}`));
    this.clients.push(client);
    return client;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }
}
