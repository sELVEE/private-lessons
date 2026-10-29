import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PushService } from './push.service.js';

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith('https://').max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
const endpointSchema = z.object({ endpoint: z.string().max(1000) });

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('key')
  key(@Auth() _auth: AuthContext) {
    return { publicKey: this.push.publicKey };
  }

  @Post('subscribe')
  @HttpCode(204)
  subscribe(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(subscriptionSchema)) b: z.infer<typeof subscriptionSchema>,
  ) {
    return this.push.subscribe(user.id, b);
  }

  @Post('unsubscribe')
  @HttpCode(204)
  unsubscribe(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(endpointSchema)) b: { endpoint: string },
  ) {
    return this.push.unsubscribe(user.id, b.endpoint);
  }
}
