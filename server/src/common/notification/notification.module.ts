import { Module } from '@nestjs/common';
import { EMAIL_SENDER } from './contracts/email.sender';
import { LOG_SENDER } from './contracts/log.sender';
import { NotificationQueue } from './notification.queue';
import { NotificationService } from './notification.service';
import { ConsoleLogProvider } from './providers/console-log.provider';
import { SampleEmailProvider } from './providers/sample-email.provider';

@Module({
  providers: [
    SampleEmailProvider,
    ConsoleLogProvider,
    {
      provide: EMAIL_SENDER,
      useExisting: SampleEmailProvider,
    },
    {
      provide: LOG_SENDER,
      useExisting: ConsoleLogProvider,
    },
    NotificationService,
    NotificationQueue,
  ],
  exports: [NotificationService, NotificationQueue],
})
export class NotificationModule {}
