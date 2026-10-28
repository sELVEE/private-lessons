import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RATE_LIMIT, type RateLimitOptions } from './decorators.js';
import { Errors } from './errors.js';
import { RateLimitService } from './rate-limit.service.js';

const GLOBAL: RateLimitOptions = { limit: 300, windowSec: 60 };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';
    let wait = await this.limiter.hit(`ip:${ip}`, GLOBAL.limit, GLOBAL.windowSec);
    const route = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!wait && route) {
      wait = await this.limiter.hit(`route:${ctx.getClass().name}.${ctx.getHandler().name}:${ip}`, route.limit, route.windowSec);
    }
    if (wait) throw Errors.tooManyRequests(wait);
    return true;
  }
}
