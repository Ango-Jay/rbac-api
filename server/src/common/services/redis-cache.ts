import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheHelper implements OnModuleDestroy {
  private readonly redisClient: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redisClient = new Redis({
      host: this.configService.getOrThrow<string>('redis.host'),
      port: this.configService.getOrThrow<number>('redis.port'),
      username: this.configService.get<string>('redis.username'),
      password: this.configService.get<string>('redis.password'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient.status !== 'end') {
      await this.redisClient.quit();
    }
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.ensureConnection();
    await this.redisClient.setex(key, ttlSeconds, value);
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnection();
    return this.redisClient.get(key);
  }

  private async ensureConnection(): Promise<void> {
    if (this.redisClient.status === 'wait') {
      await this.redisClient.connect();
    }
  }
}

@Global()
@Module({
  providers: [RedisCacheHelper],
  exports: [RedisCacheHelper],
})
export class RedisCacheModule {}
