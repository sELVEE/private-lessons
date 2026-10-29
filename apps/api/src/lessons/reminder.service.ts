import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { lessons, users } from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { PushService } from '../push/push.service.js';
import { REDIS } from '../redis/redis.module.js';

const REMIND_BEFORE_MS = 24 * 3600_000;
const tutor = alias(users, 'tutor');
const student = alias(users, 'student');

/**
 * Sends one e-mail reminder per lesson about 24 h before it starts. Runs every minute; a Redis
 * lock keeps several API instances from sending duplicates. Also sends Web Push to subscribed devices.
 */
@Injectable()
export class ReminderService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ReminderService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.tick().catch((e: Error) => this.logger.error(e.message)),
      60_000,
    );
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<number> {
    const locked = await this.redis.set('lock:reminders', '1', 'EX', 55, 'NX');
    if (!locked) return 0;
    const due = await this.db
      .select({
        l: lessons,
        tutorName: tutor.displayName,
        tutorEmail: tutor.email,
        studentName: student.displayName,
        studentEmail: student.email,
      })
      .from(lessons)
      .innerJoin(tutor, eq(tutor.id, lessons.tutorId))
      .innerJoin(student, eq(student.id, lessons.studentId))
      .where(
        and(
          eq(lessons.status, 'scheduled'),
          isNull(lessons.reminderSentAt),
          gt(lessons.startsAt, now),
          lt(lessons.startsAt, new Date(now.getTime() + REMIND_BEFORE_MS)),
        ),
      )
      .limit(200);
    for (const d of due) {
      const claimed = await this.db
        .update(lessons)
        .set({ reminderSentAt: now })
        .where(and(eq(lessons.id, d.l.id), isNull(lessons.reminderSentAt)))
        .returning({ id: lessons.id });
      if (!claimed.length) continue;
      const when = d.l.startsAt.toLocaleString('pl-PL', {
        timeZone: 'Europe/Warsaw',
        dateStyle: 'full',
        timeStyle: 'short',
      });
      const where = d.l.location ? `\nMiejsce: ${d.l.location}` : '';
      await this.mail.send({
        to: d.studentEmail,
        subject: `Przypomnienie: lekcja ${when}`,
        text: `Cześć ${d.studentName}! Przypominamy o lekcji z ${d.tutorName}: ${when} (${d.l.durationMin} min).${where}\n\nJeśli nie możesz, odwołaj ją w aplikacji: ${this.mail.link('/app/calendar')}`,
      });
      await this.push.notify([d.l.studentId, d.l.tutorId], {
        title: 'Jutro lekcja',
        body: `${when} · ${d.studentName} z ${d.tutorName}`,
        url: `/app/lessons/${d.l.id}`,
      });
      await this.mail.send({
        to: d.tutorEmail,
        subject: `Przypomnienie: lekcja z ${d.studentName}`,
        text: `Lekcja z ${d.studentName}: ${when} (${d.l.durationMin} min).${where}`,
      });
    }
    return due.length;
  }
}
