import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
  type Availability,
  availabilityDateSchema,
  availabilityExceptionSchema,
  type WeeklyHours,
  weeklyHoursSchema,
} from '@pl/shared';
import type { z } from 'zod';
import { Auth } from '../common/decorators.js';
import type { AuthContext } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AvailabilityService } from './availability.service.js';

const DatePipe = new ZodPipe(availabilityDateSchema);

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  get(@Auth() { user }: AuthContext): Promise<Availability> {
    return this.availability.get(user);
  }

  @Put('weekly')
  saveWeekly(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(weeklyHoursSchema)) b: WeeklyHours,
  ): Promise<Availability> {
    return this.availability.saveWeekly(user, b);
  }

  @Put('exceptions/:date')
  saveException(
    @Auth() { user }: AuthContext,
    @Param('date', DatePipe) date: string,
    @Body(new ZodPipe(availabilityExceptionSchema)) b: z.infer<typeof availabilityExceptionSchema>,
  ): Promise<Availability> {
    return this.availability.saveException(user, date, b);
  }

  @Delete('exceptions/:date')
  removeException(
    @Auth() { user }: AuthContext,
    @Param('date', DatePipe) date: string,
  ): Promise<Availability> {
    return this.availability.removeException(user, date);
  }
}
