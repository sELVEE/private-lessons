import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type ChildInfo,
  createInviteSchema,
  type EnrollmentDetail,
  type EnrollmentInfo,
  type InviteInfo,
  type InvitePreview,
  type ParentLinkCode,
  type ParentLinkInfo,
  redeemCodeSchema,
  subjectSchema,
  type SubjectInfo,
  topicSchema,
  updateEnrollmentSchema,
  updateStudentProfileSchema,
} from '@pl/shared';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { Auth, RateLimit } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { studentProfiles } from '../db/schema.js';
import { requireAccountType } from './access.js';
import { EnrollmentsService } from './enrollments.service.js';
import { InvitesService } from './invites.service.js';
import { ParentsService } from './parents.service.js';
import { SubjectsService } from './subjects.service.js';

const Uuid = new ParseUUIDPipe();

@Controller()
export class TeachingController {
  constructor(
    private readonly subjects: SubjectsService,
    private readonly invites: InvitesService,
    private readonly enrollments: EnrollmentsService,
    private readonly parents: ParentsService,
    private readonly audit: AuditService,
    @Inject(DB) private readonly db: Db,
  ) {}

  // ---------------------------------------------------------------- subjects & topics (tutor)

  @Get('subjects')
  listSubjects(@Auth() { user }: AuthContext): Promise<SubjectInfo[]> {
    return this.subjects.list(user);
  }

  @Post('subjects')
  createSubject(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(subjectSchema)) b: { name: string },
  ) {
    return this.subjects.create(user, b.name);
  }

  @Patch('subjects/:id')
  @HttpCode(204)
  renameSubject(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(subjectSchema)) b: { name: string },
  ) {
    return this.subjects.rename(user, id, b.name);
  }

  @Delete('subjects/:id')
  @HttpCode(204)
  removeSubject(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.subjects.remove(user, id);
  }

  @Post('subjects/:id/topics')
  @HttpCode(204)
  addTopic(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(topicSchema)) b: z.infer<typeof topicSchema>,
  ) {
    return this.subjects.addTopic(user, id, b.name, b.parentId ?? null);
  }

  @Delete('topics/:id')
  @HttpCode(204)
  removeTopic(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.subjects.removeTopic(user, id);
  }

  // ---------------------------------------------------------------- invites

  @Get('invites')
  listInvites(@Auth() { user }: AuthContext): Promise<InviteInfo[]> {
    return this.invites.list(user);
  }

  @RateLimit({ limit: 30, windowSec: 3600 })
  @Post('invites')
  createInvite(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(createInviteSchema)) b: z.infer<typeof createInviteSchema>,
  ): Promise<InviteInfo> {
    return this.invites.create(user, b);
  }

  @Delete('invites/:id')
  @HttpCode(204)
  revokeInvite(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.invites.revoke(user, id);
  }

  @RateLimit({ limit: 10, windowSec: 900 })
  @Post('invites/preview')
  @HttpCode(200)
  previewInvite(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(redeemCodeSchema)) b: { code: string },
  ): Promise<InvitePreview> {
    return this.invites.preview(user, b.code);
  }

  @RateLimit({ limit: 10, windowSec: 900 })
  @Post('invites/redeem')
  redeemInvite(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(redeemCodeSchema)) b: { code: string },
  ): Promise<EnrollmentInfo> {
    return this.invites.redeem(user, b.code);
  }

  // ---------------------------------------------------------------- enrollments (all roles, RLS-filtered)

  @Get('enrollments')
  listEnrollments(@Auth() { user }: AuthContext): Promise<EnrollmentInfo[]> {
    return this.enrollments.list(user);
  }

  @Get('enrollments/:id')
  enrollment(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
  ): Promise<EnrollmentDetail> {
    return this.enrollments.detail(user, id);
  }

  @Patch('enrollments/:id')
  updateEnrollment(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(updateEnrollmentSchema)) b: z.infer<typeof updateEnrollmentSchema>,
  ): Promise<EnrollmentDetail> {
    return this.enrollments.update(user, id, b);
  }

  // ---------------------------------------------------------------- student profile

  @Patch('account/profile')
  @HttpCode(204)
  async updateProfile(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(updateStudentProfileSchema)) b: z.infer<typeof updateStudentProfileSchema>,
  ) {
    requireAccountType(user, 'student');
    await this.db
      .update(studentProfiles)
      .set({ schoolLevel: b.schoolLevel, grade: b.grade })
      .where(eq(studentProfiles.userId, user.id));
    await this.audit.log({ actorId: user.id, action: 'profile.updated' });
  }

  // ---------------------------------------------------------------- parents

  @RateLimit({ limit: 10, windowSec: 3600 })
  @Post('parent-links/code')
  @HttpCode(200)
  parentCode(@Auth() { user }: AuthContext): Promise<ParentLinkCode> {
    return this.parents.createCode(user);
  }

  @RateLimit({ limit: 10, windowSec: 900 })
  @Post('parent-links/redeem')
  redeemParentCode(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(redeemCodeSchema)) b: { code: string },
  ): Promise<ParentLinkInfo> {
    return this.parents.redeem(user, b.code);
  }

  @Get('parent-links')
  parentLinks(@Auth() { user }: AuthContext): Promise<ParentLinkInfo[]> {
    return this.parents.listLinks(user);
  }

  @Delete('parent-links/:id')
  @HttpCode(204)
  removeParentLink(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string) {
    return this.parents.removeLink(user, id);
  }

  @Get('children')
  children(@Auth() { user }: AuthContext): Promise<ChildInfo[]> {
    return this.parents.children(user);
  }
}
