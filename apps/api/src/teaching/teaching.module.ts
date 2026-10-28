import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service.js';
import { InvitesService } from './invites.service.js';
import { ParentsService } from './parents.service.js';
import { SubjectsService } from './subjects.service.js';
import { TeachingController } from './teaching.controller.js';

@Module({
  controllers: [TeachingController],
  providers: [SubjectsService, InvitesService, EnrollmentsService, ParentsService],
})
export class TeachingModule {}
