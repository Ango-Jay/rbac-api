import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ACTIVITY_LOGS_QUEUE } from '../queue/queue.constants';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogPersistPayload } from './dto/create-activity-log.dto';

@Processor(ACTIVITY_LOGS_QUEUE)
export class ActivityLogProcessor extends WorkerHost {
  private readonly logger = new Logger(ActivityLogProcessor.name);

  constructor(private readonly activityLogService: ActivityLogService) {
    super();
  }

  async process(job: Job<ActivityLogPersistPayload>): Promise<void> {
    try {
      await this.activityLogService.persist(job.data);
    } catch (error) {
      this.logger.error(
        `Failed to persist activity log job ${job.id} for event "${job.data.event}". ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }
}
