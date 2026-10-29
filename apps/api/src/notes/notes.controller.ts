import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { type NoteInfo, noteSchema, type ReportInfo, reportSchema } from '@pl/shared';
import type { z } from 'zod';
import { Auth } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { NotesService } from './notes.service.js';

const Uuid = new ParseUUIDPipe();

@Controller()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get('lessons/:id/note')
  note(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string): Promise<NoteInfo> {
    return this.notes.getNote(user, id);
  }

  @Put('lessons/:id/note')
  saveNote(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(noteSchema)) b: { content: string },
  ) {
    return this.notes.saveNote(user, id, b.content);
  }

  @Get('lessons/:id/report')
  report(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string): Promise<ReportInfo | null> {
    return this.notes.getReport(user, id);
  }

  @Put('lessons/:id/report')
  saveReport(
    @Auth() { user }: AuthContext,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(reportSchema)) b: z.infer<typeof reportSchema>,
  ): Promise<ReportInfo> {
    return this.notes.saveReport(user, id, b);
  }

  @Get('enrollments/:id/reports')
  reports(@Auth() { user }: AuthContext, @Param('id', Uuid) id: string): Promise<ReportInfo[]> {
    return this.notes.listReports(user, id);
  }
}
