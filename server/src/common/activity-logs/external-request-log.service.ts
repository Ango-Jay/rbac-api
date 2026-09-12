import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExternalRequestLogDto } from './dto/create-external-request-log.dto';
import { ExternalRequestLog } from './entities/external-request-log.entity';

@Injectable()
export class ExternalRequestLogService {
  constructor(
    @InjectRepository(ExternalRequestLog)
    private readonly externalRequestLogsRepository: Repository<ExternalRequestLog>,
  ) {}

  async log(dto: CreateExternalRequestLogDto): Promise<ExternalRequestLog> {
    const externalRequestLog = this.externalRequestLogsRepository.create({
      action: dto.action,
      endpoint: dto.endpoint,
      status: dto.status ?? null,
      response: dto.response,
      payload: dto.payload,
      actor: dto.actor,
      actorType: dto.actorType,
      organisationId: dto.organisationId ?? null,
      timestamp: new Date(),
    });

    return this.externalRequestLogsRepository.save(externalRequestLog);
  }
}
