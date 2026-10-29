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
  type HomeworkInfo,
  homeworkSchema,
  type MaterialInfo,
  materialSchema,
  reviewHomeworkSchema,
  shareSchema,
  submitHomeworkSchema,
} from '@pl/shared';
import { z } from 'zod';
import { Auth } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { MaterialsService } from './materials.service.js';

const Uuid = new ParseUUIDPipe();
const optionalId = z.object({ subjectId: z.uuid().optional(), enrollmentId: z.uuid().optional() });

@Controller()
export class MaterialsController {
  constructor(private readonly svc: MaterialsService) {}

  @Get('materials')
  list(
    @Auth() { user }: AuthContext,
    @Query(new ZodPipe(optionalId)) q: z.infer<typeof optionalId>,
  ): Promise<MaterialInfo[]> {
    return this.svc.listMaterials(user, q.subjectId);
  }

  @Get('materials/:id')
  get(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string): Promise<MaterialInfo> {
    return this.svc.getMaterial(user, id);
  }

  @Post('materials')
  create(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(materialSchema)) b: z.infer<typeof materialSchema>,
  ) {
    return this.svc.createMaterial(user, b);
  }

  @Put('materials/:id')
  update(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(materialSchema)) b: z.infer<typeof materialSchema>,
  ) {
    return this.svc.updateMaterial(user, id, b);
  }

  @Delete('materials/:id')
  @HttpCode(204)
  remove(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.svc.deleteMaterial(user, id);
  }

  @Put('materials/:id/shares')
  share(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(shareSchema)) b: { enrollmentIds: string[] },
  ) {
    return this.svc.share(user, id, b.enrollmentIds);
  }

  @Get('homework')
  homework(
    @Auth() { user }: AuthContext,
    @Query(new ZodPipe(optionalId)) q: z.infer<typeof optionalId>,
  ): Promise<HomeworkInfo[]> {
    return this.svc.listHomework(user, q.enrollmentId);
  }

  @Post('homework')
  assign(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(homeworkSchema)) b: z.infer<typeof homeworkSchema>,
  ) {
    return this.svc.assign(user, b);
  }

  @Post('homework/:id/submit')
  @HttpCode(200)
  submit(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(submitHomeworkSchema)) b: { submission: string },
  ) {
    return this.svc.submit(user, id, b.submission);
  }

  @Post('homework/:id/review')
  @HttpCode(200)
  review(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(reviewHomeworkSchema)) b: z.infer<typeof reviewHomeworkSchema>,
  ) {
    return this.svc.review(user, id, b.feedback, b.grade);
  }

  @Delete('homework/:id')
  @HttpCode(204)
  removeHomework(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.svc.removeHomework(user, id);
  }
}
