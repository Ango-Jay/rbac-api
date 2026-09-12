import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ACTIVITY_LOGS_QUEUE, NOTIFICATIONS_QUEUE } from './queue.constants';

@Injectable()
export class QueueHelper {
  private readonly logger = new Logger(QueueHelper.name);
  private readonly queues: Map<string, Queue>;

  constructor(
    @InjectQueue(ACTIVITY_LOGS_QUEUE)
    activityLogsQueue: Queue,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    notificationsQueue: Queue,
  ) {
    this.queues = new Map<string, Queue>([
      [ACTIVITY_LOGS_QUEUE, activityLogsQueue],
      [NOTIFICATIONS_QUEUE, notificationsQueue],
    ]);
  }

  async enqueue(
    queueName: string,
    jobName: string,
    data: unknown,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Unknown queue "${queueName}"`);
    }

    try {
      await queue.add(jobName, data);
    } catch (error) {
      const contextSuffix = context
        ? ` context=${JSON.stringify(context)}`
        : '';
      this.logger.error(
        `Queue enqueue failed for queue="${queueName}" job="${jobName}"${contextSuffix}. ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }
}
