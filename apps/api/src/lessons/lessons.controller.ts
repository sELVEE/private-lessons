import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  cancelLessonSchema,
  chargeDecisionSchema,
  completeLessonSchema,
  createLessonSchema,
  type LessonDetail,
  type LessonInfo,
  lessonRangeSchema,
  type OrgSettings,
  orgSettingsSchema,
  rescheduleLessonSchema,
} from '@pl/shared';
import type { z } from 'zod';
import { Auth } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { LessonsService } from './lessons.service.js';

const Uuid = new ParseUUIDPipe();
const MAX_RANGE_MS = 100 * 24 * 3600_000;

@Controller()
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get('lessons')
  list(
    @Auth() { user }: AuthContext,
    @Query(new ZodPipe(lessonRangeSchema)) q: z.infer<typeof lessonRangeSchema>,
  ): Promise<LessonInfo[]> {
    const from = new Date(q.from);
    const to = new Date(Math.min(new Date(q.to).getTime(), from.getTime() + MAX_RANGE_MS));
    return this.lessons.list(user, from, to, q.enrollmentId);
  }

  @Get('lessons/:id')
  detail(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string): Promise<LessonDetail> {
    return this.lessons.detail(user, id);
  }

  @Post('lessons')
  create(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(createLessonSchema)) b: z.infer<typeof createLessonSchema>,
  ) {
    return this.lessons.create(user, b);
  }

  @Post('lessons/:id/reschedule')
  @HttpCode(200)
  reschedule(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(rescheduleLessonSchema)) b: z.infer<typeof rescheduleLessonSchema>,
  ) {
    return this.lessons.reschedule(user, id, b.startsAt, b.durationMin, b.note);
  }

  @Post('lessons/:id/cancel')
  @HttpCode(200)
  cancel(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(cancelLessonSchema)) b: { reason?: string },
  ) {
    return this.lessons.cancel(user, id, b.reason);
  }

  @Post('lessons/:id/complete')
  @HttpCode(200)
  complete(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(completeLessonSchema)) b: z.infer<typeof completeLessonSchema>,
  ) {
    return this.lessons.complete(user, id, b.attendance);
  }

  @Post('lessons/:id/charge')
  @HttpCode(200)
  charge(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(chargeDecisionSchema)) b: { chargeable: boolean },
  ) {
    return this.lessons.decideCharge(user, id, b.chargeable);
  }

  @Get('settings')
  settings(@Auth() { user }: AuthContext): Promise<OrgSettings> {
    return this.lessons.getSettings(user);
  }

  @Put('settings')
  saveSettings(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(orgSettingsSchema)) b: OrgSettings,
  ): Promise<OrgSettings> {
    return this.lessons.saveSettings(user, b);
  }
}
