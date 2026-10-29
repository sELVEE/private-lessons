import { Global, Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import { LessonHooks } from './lesson-hooks.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';
import { ReminderService } from './reminder.service.js';

@Global()
@Module({
  controllers: [LessonsController, AvailabilityController],
  providers: [AvailabilityService, LessonsService, LessonHooks, ReminderService],
  exports: [LessonHooks, ReminderService],
})
export class LessonsModule {}
