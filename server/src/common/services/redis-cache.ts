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

  async setWithExpiry(
    key: string,
    ttlSeconds: number,
    value: string,
  ): Promise<void> {
    await this.ensureConnection();
    await this.redisClient.setex(key, ttlSeconds, value);
  }

  async getValue(key: string): Promise<string | null> {
    await this.ensureConnection();
    return this.redisClient.get(key);
  }

  async getDelValue(key: string): Promise<string | null> {
    await this.ensureConnection();
    return this.redisClient.getdel(key);
  }

  async findKeysMatching(pattern: string): Promise<string[]> {
    await this.ensureConnection();
    const matchingKeys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batchKeys] = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      matchingKeys.push(...batchKeys);
    } while (cursor !== '0');

    return matchingKeys;
  }

  async deleteKeys(...keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.ensureConnection();
    await this.redisClient.del(...keys);
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
