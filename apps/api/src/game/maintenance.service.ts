import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QUEUES, QueueService } from '../jobs/queue.service';
import { MinigamesService } from '../minigames/minigames.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';

/** Tâches programmées de nettoyage (parties abandonnées, sessions expirées, journal social). */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
    private readonly games: MinigamesService,
    private readonly social: SocialService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(QUEUES.maintenance, 'cleanup', () => this.cleanup());
    await this.queue.every(QUEUES.maintenance, 'cleanup', 60 * 60_000);
  }

  async cleanup(): Promise<void> {
    const games = await this.games.expireStale();
    const { count: sessions } = await this.prisma.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
          { revokedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
        ],
      },
    });
    const social = await this.social.prune();
    if (games || sessions)
      this.logger.log(`Nettoyage : ${games} parties expirées, ${sessions} sessions supprimées`);
    if (social.visits || social.events)
      this.logger.log(
        `Nettoyage social : ${social.visits} visites, ${social.events} événements anciens`,
      );
  }
}
