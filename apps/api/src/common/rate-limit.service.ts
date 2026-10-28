import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

/** Fixed-window counters in Redis, shared by all API instances. */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Counts a hit. Returns seconds to wait if the limit is exceeded, otherwise 0. */
  async hit(key: string, limit: number, windowSec: number): Promise<number> {
    const k = `rl:${key}`;
    const [[, count], [, ttl]] = (await this.redis.multi().incr(k).ttl(k).exec()) as [
      [null, number],
      [null, number],
    ];
    if (ttl < 0) await this.redis.expire(k, windowSec);
    return count > limit ? Math.max(ttl, 1) : 0;
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`rl:${key}`);
  }
}
