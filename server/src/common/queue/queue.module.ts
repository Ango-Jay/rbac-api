import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ACTIVITY_LOGS_QUEUE, NOTIFICATIONS_QUEUE } from './queue.constants';
import { QueueHelper } from './queue.helper';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('redis.host'),
          port: configService.getOrThrow<number>('redis.port'),
          username: configService.get<string>('redis.username') || undefined,
          password: configService.get<string>('redis.password') || undefined,
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: ACTIVITY_LOGS_QUEUE },
      { name: NOTIFICATIONS_QUEUE },
    ),
  ],
  providers: [QueueHelper],
  exports: [BullModule, QueueHelper],
})
export class QueueModule {}
