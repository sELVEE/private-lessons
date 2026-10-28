import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MfaService } from './mfa.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

@Module({
  controllers: [AuthController, AccountController],
  providers: [AuthService, MfaService, PasswordService, SessionService, TokenService],
  exports: [SessionService],
})
export class AuthModule {}
