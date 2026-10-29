import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { pushSubscriptions } from '../db/schema.js';

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path opened when the notification is clicked. */
  url?: string;
}

/** Web Push via VAPID. Disabled (no-op) when keys are not configured. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly enabled: boolean;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.enabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.enabled)
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  }

  get publicKey(): string | null {
    return this.enabled ? this.env.VAPID_PUBLIC_KEY! : null;
  }

  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.db
      .insert(pushSubscriptions)
      .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async notify(userIds: string[], msg: PushMessage): Promise<void> {
    if (!this.enabled || !userIds.length) return;
    const subs = await this.db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));
    // Payload format understood by Angular's service worker (ngsw).
    const payload = JSON.stringify({
      notification: {
        title: msg.title,
        body: msg.body,
        icon: '/icons/icon-192x192.png',
        data: {
          onActionClick: {
            default: { operation: 'navigateLastFocusedOrOpen', url: msg.url ?? '/app' },
          },
        },
      },
    });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 3600 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          } else {
            this.logger.warn(`push failed: ${(err as Error).message}`);
          }
        }
      }),
    );
  }
}
