import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';
import { ActivityLog } from './entities/activity-log.entity';

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogsRepository: Repository<ActivityLog>,
  ) {}

  async log(dto: CreateActivityLogDto): Promise<ActivityLog> {
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
      timestamp: dto.timestamp ?? new Date(),
      metadata: dto.metadata ?? null,
    });

    return this.activityLogsRepository.save(activityLog);
  }
}
