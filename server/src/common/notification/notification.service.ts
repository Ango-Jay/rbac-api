import { Inject, Injectable, NotImplementedException, Optional } from '@nestjs/common';
import { EMAIL_SENDER, type EmailSender } from './contracts/email.sender';
import { LOG_SENDER, type LogSender } from './contracts/log.sender';
import { SMS_SENDER, type SmsSender } from './contracts/sms.sender';
import type {
  EmailMessage,
  LogMessage,
  SmsMessage,
} from './notification.types';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(LOG_SENDER) private readonly logSender: LogSender,
    @Optional() @Inject(SMS_SENDER) private readonly smsSender?: SmsSender,
  ) {}

  async notifyEmail(message: EmailMessage): Promise<void> {
    await this.emailSender.send(message);
  }

  async notifySms(message: SmsMessage): Promise<void> {
    if (!this.smsSender) {
      throw new NotImplementedException('SMS notification provider is not configured');
    }

    await this.smsSender.send(message);
  }

  async notifyLog(message: LogMessage): Promise<void> {
    await this.logSender.send(message);
  }
}
