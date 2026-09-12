import {
  Inject,
  Injectable,
  Logger,
  NotImplementedException,
  Optional,
} from '@nestjs/common';
import { EMAIL_SENDER, type EmailSender } from './contracts/email.sender';
import { LOG_SENDER, type LogSender } from './contracts/log.sender';
import { SMS_SENDER, type SmsSender } from './contracts/sms.sender';
import { NotificationQueue } from './notification.queue';
import type {
  EmailMessage,
  LogMessage,
  SmsMessage,
} from './notification.types';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(LOG_SENDER) private readonly logSender: LogSender,
    private readonly notificationQueue: NotificationQueue,
    @Optional() @Inject(SMS_SENDER) private readonly smsSender?: SmsSender,
  ) {}

  async notifyEmail(message: EmailMessage): Promise<void> {
    try {
      await this.notificationQueue.enqueueEmail(message);
    } catch {
      this.logger.error(
        `Notification email queue enqueue failed for "${message.to}"; using sync send fallback.`,
      );
      await this.emailSender.send(message);
    }
  }

  async notifySms(message: SmsMessage): Promise<void> {
    if (!this.smsSender) {
      throw new NotImplementedException(
        'SMS notification provider is not configured',
      );
    }

    await this.smsSender.send(message);
  }

  async notifyLog(message: LogMessage): Promise<void> {
    await this.logSender.send(message);
  }
}
