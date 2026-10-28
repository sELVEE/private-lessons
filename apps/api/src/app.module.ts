import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { CsrfMiddleware } from './common/csrf.middleware.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { ENV, type Env } from './config/env.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({})
class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return { module: ConfigModule, global: true, providers: [{ provide: ENV, useValue: env }], exports: [ENV] };
  }
}

@Module({})
export class AppModule implements NestModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        DbModule,
        RedisModule,
        CryptoModule,
        CommonModule,
        MailModule,
        AuditModule,
        AuthModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        // Order matters: rate limiting runs before session lookup.
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*path');
  }
}
