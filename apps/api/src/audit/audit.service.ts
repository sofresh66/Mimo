import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  familyId?: string | null;
  userId?: string | null;
  childId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Journal de sécurité. N'échoue jamais la requête appelante. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          familyId: entry.familyId ?? null,
          userId: entry.userId ?? null,
          childId: entry.childId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 255) ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.warn(`Audit non enregistré (${entry.action}) : ${String(error)}`);
    }
  }
}
