import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import type { AppConfig } from '../config/env';
import type { RedisService } from '../redis/redis.service';

/**
 * Adaptateur Socket.IO : CORS limité à l'origine web, et adaptateur Redis
 * (diffusion entre plusieurs instances de l'API) lorsque Redis est disponible.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfig,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.config.webOrigin, credentials: true },
      serveClient: false,
    }) as Server;
    if (this.redis.enabled) {
      server.adapter(createAdapter(this.redis.createClient(), this.redis.createClient()));
    }
    return server;
  }
}
