import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogProcessor } from './activity-log.processor';
import { ActivityLogService } from './activity-log.service';
import { ActivityLog } from './entities/activity-log.entity';
import { ExternalRequestLog } from './entities/external-request-log.entity';
import { ExternalRequestLogService } from './external-request-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog, ExternalRequestLog])],
  providers: [
    ActivityLogService,
    ActivityLogProcessor,
    ExternalRequestLogService,
  ],
  exports: [ActivityLogService, ExternalRequestLogService],
})
export class ActivityLogsModule {}
