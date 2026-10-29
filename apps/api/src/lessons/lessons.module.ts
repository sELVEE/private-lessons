import { Global, Module } from '@nestjs/common';
import { LessonHooks } from './lesson-hooks.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';
import { ReminderService } from './reminder.service.js';

@Global()
@Module({
  controllers: [LessonsController],
  providers: [LessonsService, LessonHooks, ReminderService],
  exports: [LessonHooks, ReminderService],
})
export class LessonsModule {}
