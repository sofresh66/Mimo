import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export type JobHandler = (data: Record<string, unknown>) => Promise<void>;

export const QUEUES = {
  exploration: 'exploration',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Délai maximal accepté par setTimeout (~24,8 jours). */
const MAX_TIMEOUT = 2_147_483_647;

/**
 * Files de tâches différées et planifiées.
 * - Avec Redis : BullMQ (persistant, distribué, relances automatiques).
 * - Sans Redis : minuteries en mémoire. Les traitements restent idempotents et
 *   l'état de référence est en base, donc une tâche perdue au redémarrage est
 *   rattrapée par le balayage de maintenance.
 */
@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(private readonly redis: RedisService) {}

  get driver(): 'bullmq' | 'memory' {
    return this.redis.enabled ? 'bullmq' : 'memory';
  }

  /** Enregistre le traitement d'un type de tâche (`queue:job`). */
  register(queue: QueueName, job: string, handler: JobHandler): void {
    this.handlers.set(`${queue}:${job}`, handler);
    if (this.redis.enabled && !this.workers.some((w) => w.name === queue)) {
      const worker = new Worker(
        queue,
        (j: Job) => this.dispatch(queue, j.name, j.data as Record<string, unknown>),
        {
          connection: this.redis.createClient(),
          concurrency: 5,
        },
      );
      worker.on('failed', (j, error) =>
        this.logger.error(`Tâche ${queue}:${j?.name} échouée : ${error.message}`),
      );
      this.workers.push(worker);
    }
  }

  /** Planifie une tâche unique après `delayMs`. `jobId` rend l'ajout idempotent. */
  async schedule(
    queue: QueueName,
    job: string,
    data: Record<string, unknown>,
    options: { delayMs: number; jobId?: string },
  ): Promise<void> {
    const delay = Math.max(0, options.delayMs);
    if (this.redis.enabled) {
      await this.queue(queue).add(job, data, {
        delay,
        jobId: options.jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
      return;
    }
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        void this.dispatch(queue, job, data).catch((error: unknown) =>
          this.logger.error(`Tâche ${queue}:${job} échouée : ${String(error)}`),
        );
      },
      Math.min(delay, MAX_TIMEOUT),
    );
    timer.unref();
    this.timers.add(timer);
  }

  /** Tâche récurrente (ex. balayage de maintenance). */
  async every(queue: QueueName, job: string, intervalMs: number): Promise<void> {
    if (this.redis.enabled) {
      await this.queue(queue).upsertJobScheduler(
        `${queue}:${job}`,
        { every: intervalMs },
        { name: job },
      );
      return;
    }
    const timer = setInterval(() => {
      void this.dispatch(queue, job, {}).catch((error: unknown) =>
        this.logger.error(`Tâche ${queue}:${job} échouée : ${String(error)}`),
      );
    }, intervalMs);
    timer.unref();
    this.timers.add(timer);
  }

  private queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.redis.createClient() });
      this.queues.set(name, queue);
    }
    return queue;
  }

  private async dispatch(queue: string, job: string, data: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(`${queue}:${job}`);
    if (!handler) {
      this.logger.warn(`Aucun traitement pour ${queue}:${job}`);
      return;
    }
    await handler(data);
  }

  async onApplicationShutdown(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
