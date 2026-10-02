import { Logger } from '@nestjs/common';

/**
 * Effets de bord à exécuter APRÈS la validation d'une transaction
 * (notifications temps réel, planification de tâches). On évite ainsi de notifier
 * un événement qui serait finalement annulé par un rollback.
 */
export class Effects {
  private static readonly logger = new Logger('Effects');
  private readonly queue: Array<() => void | Promise<void>> = [];

  add(effect: () => void | Promise<void>): void {
    this.queue.push(effect);
  }

  async flush(): Promise<void> {
    for (const effect of this.queue.splice(0)) {
      try {
        await effect();
      } catch (error) {
        Effects.logger.error(`Effet post-transaction en échec : ${String(error)}`);
      }
    }
  }
}
