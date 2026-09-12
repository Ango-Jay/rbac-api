import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from '../queue/queue.constants';
import { EMAIL_SENDER, type EmailSender } from './contracts/email.sender';
import type { EmailMessage } from './notification.types';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {
    super();
  }

  async process(job: Job<EmailMessage>): Promise<void> {
    try {
      await this.emailSender.send(job.data);
    } catch (error) {
      this.logger.error(
        `Failed to send notification email job ${job.id} to "${job.data.to}". ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }
}
