import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { lessons, users } from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import type { Tx } from '../rls/rls.service.js';

type Lesson = typeof lessons.$inferSelect;
type User = typeof users.$inferSelect;

export interface ChargeHandler {
  charge(tx: Tx, lessonId: string): Promise<void>;
  uncharge(tx: Tx, lessonId: string): Promise<void>;
}

/**
 * Side effects of lesson changes: e-mails to the other party and billing (registered by the
 * billing module, so lessons do not depend on it).
 */
@Injectable()
export class LessonHooks {
  private readonly logger = new Logger(LessonHooks.name);
  private billing: ChargeHandler | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly mail: MailService,
  ) {}

  registerBilling(handler: ChargeHandler) {
    this.billing = handler;
  }

  async charged(tx: Tx, lessonId: string) {
    await this.billing?.charge(tx, lessonId);
  }

  async uncharged(tx: Tx, lessonId: string) {
    await this.billing?.uncharge(tx, lessonId);
  }

  async notify(kind: 'rescheduled' | 'cancelled', l: Lesson, actor: User, newStart?: Date) {
    const otherId = actor.id === l.tutorId ? l.studentId : l.tutorId;
    const [other] = await this.db.select().from(users).where(eq(users.id, otherId));
    if (!other) return;
    const when = (d: Date) =>
      d.toLocaleString('pl-PL', {
        timeZone: 'Europe/Warsaw',
        dateStyle: 'full',
        timeStyle: 'short',
      });
    const text =
      kind === 'cancelled'
        ? `${actor.displayName} odwołał(a) lekcję zaplanowaną na ${when(l.startsAt)}.`
        : `${actor.displayName} przełożył(a) lekcję z ${when(l.startsAt)} na ${when(newStart!)}.`;
    await this.mail
      .send({
        to: other.email,
        subject: kind === 'cancelled' ? 'Lekcja odwołana' : 'Lekcja przełożona',
        text: `${text}\n\nKalendarz: ${this.mail.link('/app/calendar')}`,
      })
      .catch((err: Error) => this.logger.warn(err.message));
  }
}
