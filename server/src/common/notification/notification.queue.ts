import { Injectable } from '@nestjs/common';
import {
  NOTIFICATIONS_QUEUE,
  NOTIFICATION_EMAIL_JOB,
} from '../queue/queue.constants';
import { QueueHelper } from '../queue/queue.helper';
import type { EmailMessage } from './notification.types';

@Injectable()
export class NotificationQueue {
  constructor(private readonly queueHelper: QueueHelper) {}

  async enqueueEmail(payload: EmailMessage): Promise<void> {
    await this.queueHelper.enqueue(
      NOTIFICATIONS_QUEUE,
      NOTIFICATION_EMAIL_JOB,
      payload,
      { to: payload.to },
    );
  }
}
