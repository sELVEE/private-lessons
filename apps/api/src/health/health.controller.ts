import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { Public } from '../common/decorators.js';
import { DB, type Db } from '../db/db.module.js';
import { REDIS } from '../redis/redis.module.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    await this.redis.ping();
    return { status: 'ok' };
  }
}
