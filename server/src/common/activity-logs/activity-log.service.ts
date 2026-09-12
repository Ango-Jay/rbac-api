import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ACTIVITY_LOGS_QUEUE,
  ACTIVITY_LOG_WRITE_JOB,
} from '../queue/queue.constants';
import { QueueHelper } from '../queue/queue.helper';
import {
  ActivityLogPersistPayload,
  CreateActivityLogDto,
} from './dto/create-activity-log.dto';
import { ActivityLog } from './entities/activity-log.entity';

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogsRepository: Repository<ActivityLog>,
    private readonly queueHelper: QueueHelper,
  ) {}

  async log(dto: CreateActivityLogDto): Promise<void> {
    const payload: ActivityLogPersistPayload = {
      ...dto,
      timestamp: new Date(),
    };

    try {
      await this.queueHelper.enqueue(
        ACTIVITY_LOGS_QUEUE,
        ACTIVITY_LOG_WRITE_JOB,
        payload,
        { event: payload.event },
      );
    } catch {
      this.logger.error(
        `Activity log queue enqueue failed for event "${payload.event}"; using DB fallback.`,
      );

      try {
        await this.persist(payload);
      } catch (persistError) {
        this.logger.error(
          `Activity log DB fallback failed for event "${payload.event}". ${
            persistError instanceof Error
              ? persistError.message
              : 'unknown error'
          }`,
        );
      }
    }
  }

  async persist(dto: ActivityLogPersistPayload): Promise<ActivityLog> {
    const timestamp = new Date(dto.timestamp);

    const activityLog = this.activityLogsRepository.create({
      actorType: dto.actorType,
      actor: dto.actor,
      event: dto.event,
      source: dto.source ?? null,
      sourceId: dto.sourceId ?? null,
      description: dto.description ?? null,
      status: dto.status ?? null,
      ipAddress: dto.ipAddress ?? null,
      organisationId: dto.organisationId ?? null,
      timestamp,
      metadata: dto.metadata ?? null,
    });

    return this.activityLogsRepository.save(activityLog);
  }
}
