import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { RedisCacheHelper } from '../redis-cache';
import {
  OTP_DEFAULT_TTL_SECONDS,
  OTP_KEY_PREFIX,
  OTP_MAX_ATTEMPTS,
} from './otp.constants';
import type {
  OtpGenerateParams,
  OtpVerifyParams,
  StoredOtpPayload,
} from './otp.types';

@Injectable()
export class OtpService {
  constructor(private readonly redisCache: RedisCacheHelper) {}

  async generate(
    params: OtpGenerateParams,
  ): Promise<{ code: string }> {
    const {
      identifier,
      purpose,
      ttlSeconds = OTP_DEFAULT_TTL_SECONDS,
      maxAttempts = OTP_MAX_ATTEMPTS,
    } = params;
    const redisKey = this.buildKey(purpose, identifier);

    const existing = await this.redisCache.getValue(redisKey);
    if (existing) {
      throw new ConflictException(
        'Please wait before requesting another OTP.',
      );
    }

    const code = randomInt(100000, 1000000).toString();
    const codeHash = await argon2.hash(code);
    const payload: StoredOtpPayload = {
      codeHash,
      attempts: 0,
      maxAttempts,
    };

    await this.redisCache.setWithExpiry(
      redisKey,
      ttlSeconds,
      JSON.stringify(payload),
    );

    return { code };
  }

  async verify(params: OtpVerifyParams): Promise<boolean> {
    const { identifier, purpose, submittedCode } = params;
    const redisKey = this.buildKey(purpose, identifier);

    const data = await this.redisCache.getValue(redisKey);
    if (!data) {
      return false;
    }

    let payload: StoredOtpPayload;
    try {
      payload = JSON.parse(data) as StoredOtpPayload;
    } catch {
      await this.redisCache.deleteKeys(redisKey);
      return false;
    }

    if (payload.attempts >= payload.maxAttempts) {
      await this.redisCache.deleteKeys(redisKey);
      throw new UnauthorizedException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    const isValid = await argon2.verify(payload.codeHash, submittedCode);

    if (isValid) {
      await this.redisCache.deleteKeys(redisKey);
      return true;
    }

    const ttl = await this.redisCache.getTtlSeconds(redisKey);
    const updated: StoredOtpPayload = {
      codeHash: payload.codeHash,
      attempts: payload.attempts + 1,
      maxAttempts: payload.maxAttempts,
    };

    if (ttl > 0) {
      await this.redisCache.setWithExpiry(
        redisKey,
        ttl,
        JSON.stringify(updated),
      );
    }

    return false;
  }

  private buildKey(purpose: string, identifier: string): string {
    return `${OTP_KEY_PREFIX}${purpose}:${identifier}`;
  }
}
