import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  /** Last messages sent with the `log` transport; used by tests. */
  readonly outbox: Mail[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport =
      env.MAIL_TRANSPORT === 'smtp' && env.SMTP_URL
        ? nodemailer.createTransport(env.SMTP_URL)
        : null;
  }

  link(path: string): string {
    return new URL(path, this.env.APP_URL).toString();
  }

  /** Sends without failing the request; delivery problems are logged. Moves to a queue in stage 3. */
  async send(mail: Mail): Promise<void> {
    if (!this.transport) {
      this.outbox.push(mail);
      if (this.outbox.length > 50) this.outbox.shift();
      if (this.env.NODE_ENV !== 'test')
        this.logger.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, ...mail });
    } catch (err) {
      this.logger.error(`Mail delivery failed: ${(err as Error).message}`);
    }
  }
}
