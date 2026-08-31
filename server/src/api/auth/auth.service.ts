import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_GRACE_PERIOD,
  REFRESH_TOKEN_TTL,
  hashToken,
  ttlToMs,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { Session } from './sessions/entities/session.entity';
import { AuthenticatedUser, JwtPayload } from './auth.types';

type RotationResult = {
  user: AuthenticatedUser;
  accessToken?: string;
  refreshToken?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
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

    if (!this.isUserActive(user)) {
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

    const refreshHash = hashToken(refreshToken);

    const graceSession = await this.sessionsRepository.findOne({
      where: {
        previousRefreshTokenHash: refreshHash,
        isRevoked: false,
        expiresAt: MoreThan(new Date()),
        refreshTokenGraceExpiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
    });

    if (graceSession?.user && this.isUserActive(graceSession.user)) {
      return this.toAuthenticatedUserFromUser(graceSession.user);
    }

    const rotationResult = await this.dataSource.transaction<RotationResult>(
      async (manager) => {
        let session = await manager.findOne(Session, {
          where: {
            refreshTokenHash: refreshHash,
            isRevoked: false,
            expiresAt: MoreThan(new Date()),
          },
          lock: { mode: 'pessimistic_write' },
          relations: { user: true },
        });

        if (!session) {
          session = await manager.findOne(Session, {
            where: {
              previousRefreshTokenHash: refreshHash,
              isRevoked: false,
              expiresAt: MoreThan(new Date()),
            },
            relations: { user: true },
          });

          if (
            session?.user &&
            session.refreshTokenGraceExpiresAt &&
            session.refreshTokenGraceExpiresAt > new Date() &&
            this.isUserActive(session.user)
          ) {
            return { user: this.toAuthenticatedUserFromUser(session.user) };
          }

          throw new UnauthorizedException();
        }

        if (!session.user || !this.isUserActive(session.user)) {
          throw new UnauthorizedException();
        }

        const newAccessToken = this.signAccessToken(session.user);
        const newRefreshToken = randomUUID();

        session.previousRefreshTokenHash = refreshHash;
        session.refreshTokenHash = hashToken(newRefreshToken);
        session.refreshTokenGraceExpiresAt = new Date(
          Date.now() + ttlToMs(REFRESH_TOKEN_GRACE_PERIOD),
        );

        await manager.save(session);

        return {
          user: this.toAuthenticatedUserFromUser(session.user),
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        };
      },
    );

    if (rotationResult.accessToken && rotationResult.refreshToken) {
      this.setTokenCookies(
        res,
        rotationResult.accessToken,
        rotationResult.refreshToken,
      );
    }

    return rotationResult.user;
  }

  private async issueTokens(
    user: User,
    req: Request,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = randomUUID();
    const refreshTokenHash = hashToken(refreshToken);

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

  private isUserActive(user: User): boolean {
    return user.status !== 'inactive' && user.status !== 'deleted';
  }

  private toAuthenticatedUser(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }

  private toAuthenticatedUserFromUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    this.setAccessTokenCookie(res, accessToken);
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      this.getCookieOptions(REFRESH_TOKEN_TTL),
    );
  }

  private setAccessTokenCookie(res: Response, accessToken: string): void {
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      this.getCookieOptions(ACCESS_TOKEN_TTL),
    );
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
