import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  adjustmentSchema,
  type BalanceRow,
  type BillingAccount,
  type EarningsSummary,
  monthSchema,
  packageSchema,
  paymentSchema,
  rateSchema,
  type Statement,
} from '@pl/shared';
import type { z } from 'zod';
import { Auth } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { BillingService } from './billing.service.js';

const Uuid = new ParseUUIDPipe();

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('balances')
  balances(@Auth() { user }: AuthContext): Promise<BalanceRow[]> {
    return this.billing.balances(user);
  }

  @Get('earnings')
  earnings(
    @Auth() { user }: AuthContext,
    @Query(new ZodPipe(monthSchema)) q: { month: string },
  ): Promise<EarningsSummary> {
    return this.billing.earnings(user, q.month);
  }

  @Get('enrollments/:id')
  account(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string): Promise<BillingAccount> {
    return this.billing.account(user, id);
  }

  @Get('enrollments/:id/statement')
  statement(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Query(new ZodPipe(monthSchema)) q: { month: string },
  ): Promise<Statement> {
    return this.billing.statement(user, id, q.month);
  }

  @Put('enrollments/:id/rate')
  rate(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(rateSchema)) b: { hourlyRate: number },
  ) {
    return this.billing.setRate(user, id, b.hourlyRate);
  }

  @Post('enrollments/:id/packages')
  addPackage(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(packageSchema)) b: z.infer<typeof packageSchema>,
  ) {
    return this.billing.addPackage(user, id, b);
  }

  @Post('enrollments/:id/payments')
  addPayment(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(paymentSchema)) b: z.infer<typeof paymentSchema>,
  ) {
    return this.billing.addPayment(user, id, b);
  }

  @Post('enrollments/:id/adjustments')
  addAdjustment(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(adjustmentSchema)) b: z.infer<typeof adjustmentSchema>,
  ) {
    return this.billing.addAdjustment(user, id, b);
  }

  @Delete('entries/:id')
  @HttpCode(204)
  voidEntry(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.billing.voidEntry(user, id);
  }
}
