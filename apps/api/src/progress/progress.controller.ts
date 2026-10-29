import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  assessmentSchema,
  goalSchema,
  goalUpdateSchema,
  type ProgressInfo,
  type TopicStatus,
  topicStatusSchema,
} from '@pl/shared';
import { z } from 'zod';
import { Auth, RateLimit } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ProgressService } from './progress.service.js';

const Uuid = new ParseUUIDPipe();
const periodSchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });

@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get(':enrollmentId')
  get(
    @Auth() { user }: AuthContext,
    @Param('enrollmentId', Uuid) id: string,
    @Query(new ZodPipe(periodSchema)) q: { days: number },
  ): Promise<ProgressInfo> {
    return this.progress.get(user, id, q.days);
  }

  @Post(':enrollmentId/assessments')
  addAssessment(
    @Auth() { user }: AuthContext,
    @Param('enrollmentId', Uuid) id: string,
    @Body(new ZodPipe(assessmentSchema)) b: z.infer<typeof assessmentSchema>,
  ) {
    return this.progress.addAssessment(user, id, b);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  removeAssessment(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.progress.removeAssessment(user, id);
  }

  @Put(':enrollmentId/topics/:topicId')
  setTopic(
    @Auth() { user }: AuthContext,
    @Param('enrollmentId', Uuid) id: string,
    @Param('topicId', Uuid) topicId: string,
    @Body(new ZodPipe(topicStatusSchema)) b: { status: TopicStatus | null },
  ) {
    return this.progress.setTopic(user, id, topicId, b.status);
  }

  @Post(':enrollmentId/goals')
  addGoal(
    @Auth() { user }: AuthContext,
    @Param('enrollmentId', Uuid) id: string,
    @Body(new ZodPipe(goalSchema)) b: z.infer<typeof goalSchema>,
  ) {
    return this.progress.addGoal(user, id, b.title, b.targetDate);
  }

  @Patch('goals/:id')
  @HttpCode(204)
  setGoal(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(goalUpdateSchema)) b: { achieved: boolean },
  ) {
    return this.progress.setGoal(user, id, b.achieved);
  }

  @Delete('goals/:id')
  @HttpCode(204)
  removeGoal(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.progress.removeGoal(user, id);
  }

  @RateLimit({ limit: 10, windowSec: 3600 })
  @Post(':enrollmentId/send-summary')
  @HttpCode(200)
  send(
    @Auth() { user }: AuthContext,
    @Param('enrollmentId', Uuid) id: string,
    @Query(new ZodPipe(periodSchema)) q: { days: number },
  ) {
    return this.progress.sendSummary(user, id, q.days);
  }
}
