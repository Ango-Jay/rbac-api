import { Injectable } from '@nestjs/common';
import {
  NOTIFICATIONS_QUEUE,
  NOTIFICATION_EMAIL_JOB,
} from '../queue/queue.constants';
import { QueueHelper } from '../queue/queue.helper';

export type EnqueueEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

@Injectable()
export class NotificationQueue {
  constructor(private readonly queueHelper: QueueHelper) {}

  async enqueueEmail(payload: EnqueueEmailPayload): Promise<void> {
    await this.queueHelper.enqueue(
      NOTIFICATIONS_QUEUE,
      NOTIFICATION_EMAIL_JOB,
      payload,
      { to: payload.to },
    );
  }
}
