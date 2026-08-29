import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import { MoreThan, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL,
  ttlToMs,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { Session } from './sessions/entities/session.entity';
import { AuthenticatedUser, JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    dto: LoginDto,
    req: Request,
    res: Response,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.password, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'inactive' || user.status === 'deleted') {
      throw new UnauthorizedException('Account is not active');
    }

    const { accessToken, refreshToken } = await this.issueTokens(user, req);

    this.setTokenCookies(res, accessToken, refreshToken);

    return { message: 'Login successful' };
  }

  async validateOrRefreshAccess(
    req: Request,
    res: Response,
  ): Promise<AuthenticatedUser> {
    const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;

    if (!accessToken) {
      throw new UnauthorizedException();
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(accessToken);
      return this.toAuthenticatedUser(payload);
    } catch (error) {
      if (!(error instanceof TokenExpiredError)) {
        throw new UnauthorizedException();
      }
    }

    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.sessionsRepository.findOne({
      where: {
        refreshTokenHash,
        isRevoked: false,
        expiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
    });

    if (!session?.user) {
      throw new UnauthorizedException();
    }

    if (
      session.user.status === 'inactive' ||
      session.user.status === 'deleted'
    ) {
      throw new UnauthorizedException();
    }

    const accessTokenNew = this.signAccessToken(session.user);
    this.setAccessTokenCookie(res, accessTokenNew);

    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };
  }

  private async issueTokens(
    user: User,
    req: Request,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = randomUUID();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);

    await this.sessionsRepository.save({
      user,
      refreshTokenHash,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
      expiresAt: new Date(Date.now() + ttlToMs(REFRESH_TOKEN_TTL)),
    });

    return { accessToken, refreshToken };
  }

  private signAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthenticatedUser(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    this.setAccessTokenCookie(res, accessToken);
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, this.getCookieOptions(REFRESH_TOKEN_TTL));
  }

  private setAccessTokenCookie(res: Response, accessToken: string): void {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, this.getCookieOptions(ACCESS_TOKEN_TTL));
  }

  private getCookieOptions(ttl: string) {
    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: ttlToMs(ttl),
    };
  }
}
