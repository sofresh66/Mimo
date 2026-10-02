import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';

/**
 * Client HTTP du moteur Python (FastAPI). Le moteur est optionnel :
 * toute erreur ou indisponibilité renvoie `null` et l'appelant utilise son repli local.
 */
@Injectable()
export class EngineClient {
  private readonly logger = new Logger(EngineClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async post<T>(path: string, body: unknown, timeoutMs = 2_500): Promise<T | null> {
    if (!this.config.engineUrl) return null;
    try {
      const res = await fetch(`${this.config.engineUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.engineApiKey ? { 'x-engine-key': this.config.engineApiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(`Moteur ${path} → HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (error) {
      this.logger.debug(`Moteur indisponible (${path}) : ${String(error)}`);
      return null;
    }
  }
}
