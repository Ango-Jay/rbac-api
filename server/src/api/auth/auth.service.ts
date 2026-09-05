import {
  ConflictException,
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
import { RedisCacheHelper } from '../../common/services/redis-cache';
import { User } from '../users/entities/user.entity';
import { Organisation } from '../users/organisations/entities/organisation.entity';
import { USER_ROLES } from '../users/user.constants';
import {
  ACCESS_TOKEN_BLACKLIST_PREFIX,
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_GRACE_PERIOD,
  REFRESH_TOKEN_TTL,
  hashToken,
  ttlToMs,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Session } from './sessions/entities/session.entity';
import { AuthenticatedUser, JwtPayload } from './auth.types';

type JwtPayloadWithExp = JwtPayload & { exp: number };

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
    private readonly redisCache: RedisCacheHelper,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existingUser = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password);

    if (dto.organisationName) {
      await this.dataSource.transaction(async (manager) => {
        const organisation = await manager.save(
          manager.create(Organisation, {
            name: dto.organisationName,
            ownerId: null,
          }),
        );

        const user = await manager.save(
          manager.create(User, {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            password: passwordHash,
            organisation,
            role: USER_ROLES.OWNER,
            status: 'active',
          }),
        );

        organisation.ownerId = user.id;
        await manager.save(organisation);
      });
    } else {
      await this.usersRepository.save(
        this.usersRepository.create({
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          password: passwordHash,
          organisation: null,
          role: null,
          status: 'active',
        }),
      );
    }

    return { message: 'Registration successful' };
  }

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

  async logout(req: Request, res: Response): Promise<{ message: string }> {
    const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    if (accessToken) {
      try {
        const payload =
          this.jwtService.verify<JwtPayloadWithExp>(accessToken);
        const ttlSeconds = Math.max(
          1,
          payload.exp - Math.floor(Date.now() / 1000),
        );
        await this.blacklistAccessToken(accessToken, ttlSeconds);
      } catch {
        // Access token missing/invalid/expired: skip blacklist
      }
    }

    if (refreshToken) {
      const session = await this.sessionsRepository.findOne({
        where: { refreshTokenHash: hashToken(refreshToken) },
      });

      if (session && !session.isRevoked) {
        session.isRevoked = true;
        await this.sessionsRepository.save(session);
      }
    }

    this.clearTokenCookies(res);

    return { message: 'Logout successful' };
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

      if (await this.isAccessTokenBlacklisted(accessToken)) {
        throw new UnauthorizedException();
      }

      return this.toAuthenticatedUser(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
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

  private async blacklistAccessToken(
    accessToken: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redisCache.setWithExpiry(
      `${ACCESS_TOKEN_BLACKLIST_PREFIX}${hashToken(accessToken)}`,
      ttlSeconds,
      '1',
    );
  }

  private async isAccessTokenBlacklisted(accessToken: string): Promise<boolean> {
    const result = await this.redisCache.getValue(
      `${ACCESS_TOKEN_BLACKLIST_PREFIX}${hashToken(accessToken)}`,
    );
    return result !== null;
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

  private clearTokenCookies(res: Response): void {
    const options = this.getClearCookieOptions();
    res.clearCookie(ACCESS_TOKEN_COOKIE, options);
    res.clearCookie(REFRESH_TOKEN_COOKIE, options);
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

  private getClearCookieOptions() {
    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
}
