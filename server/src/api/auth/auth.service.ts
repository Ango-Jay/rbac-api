import {
  BadRequestException,
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
import { NotificationService } from '../../common/notification/notification.service';
import { OtpService } from '../../common/services/otp/otp.service';
import { RedisCacheHelper } from '../../common/services/redis-cache';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { User } from '../users/entities/user.entity';
import { Organisation } from '../users/organisations/entities/organisation.entity';
import { OrganisationMembership } from '../users/organisations/entities/organisation-membership.entity';
import { OrganisationsService } from '../users/organisations/organisations.service';
import { USER_ROLES } from '../users/user.constants';
import {
  ACCESS_TOKEN_BLACKLIST_PREFIX,
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  LOGIN_CHALLENGE_PREFIX,
  LOGIN_CHALLENGE_PURPOSE,
  LOGIN_CHALLENGE_TTL,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_GRACE_PERIOD,
  REFRESH_TOKEN_TTL,
  hashToken,
  ttlToMs,
} from './auth.constants';
import { CompleteLoginDto } from './dto/complete-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { Session } from './sessions/entities/session.entity';
import {
  AuthenticatedUser,
  JwtPayload,
  LoginChallengePayload,
  LoginChallengeUser,
} from './auth.types';

type JwtPayloadWithExp = JwtPayload & { exp: number };

type OrgSessionContext = {
  organisationId: string | null;
  role: string | null;
};

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
    @InjectRepository(OrganisationMembership)
    private readonly membershipsRepository: Repository<OrganisationMembership>,
    @InjectRepository(Organisation)
    private readonly organisationsRepository: Repository<Organisation>,
    private readonly organisationsService: OrganisationsService,
    private readonly otpService: OtpService,
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly redisCache: RedisCacheHelper,
  ) {}

  async sendEmailOtp(dto: SendEmailOtpDto): Promise<{ message: string }> {
    const existingUser = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (!existingUser) {
      const { code } = await this.otpService.generate({
        identifier: dto.email,
        purpose: 'signup',
      });

      await this.notificationService.notifyEmail({
        to: dto.email,
        subject: 'Your verification code',
        body: `Your verification code is ${code}`,
      });

      await this.notificationService.notifyLog({
        level: 'log',
        context: 'SendEmailOtp',
        message: `signup OTP for ${dto.email}: ${code}`,
      });
    }

    return {
      message:
        'Verification code sent to email',
    };
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const otpValid = await this.otpService.verify({
      identifier: dto.email,
      purpose: 'signup',
      submittedCode: dto.otp,
    });

    if (!otpValid) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

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
            status: 'active',
          }),
        );

        organisation.ownerId = user.id;
        await manager.save(organisation);

        await manager.save(
          manager.create(OrganisationMembership, {
            user,
            organisation,
            role: USER_ROLES.OWNER,
            status: 'active',
          }),
        );
      });
    } else {
      await this.usersRepository.save(
        this.usersRepository.create({
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          password: passwordHash,
          status: 'active',
        }),
      );
    }

    return { message: 'Registration successful' };
  }

  async verifyCredentials(dto: LoginDto): Promise<{ authToken: string }> {
    const user = await this.authenticateCredentials(dto.email, dto.password);

    const payload: LoginChallengePayload = {
      sub: user.id,
      email: user.email,
      purpose: LOGIN_CHALLENGE_PURPOSE,
    };

    const authToken = this.jwtService.sign(payload, {
      expiresIn: LOGIN_CHALLENGE_TTL,
    });

    await this.redisCache.setWithExpiry(
      this.loginChallengeKey(authToken),
      Math.floor(ttlToMs(LOGIN_CHALLENGE_TTL) / 1000),
      user.id,
    );

    return { authToken };
  }

  async getLoginOrganisations(
    challengeUser: LoginChallengeUser,
  ): Promise<{ organisations: Array<{ id: string; name: string }> }> {
    return {
      organisations: await this.organisationsService.getOrganisationsForUser(
        challengeUser.id,
      ),
    };
  }

  async login(
    dto: CompleteLoginDto,
    req: Request,
    res: Response,
  ): Promise<UserProfileDto> {
    const payload = this.verifyLoginChallengeJwt(dto.authToken);

    const consumedUserId = await this.redisCache.getDelValue(
      this.loginChallengeKey(dto.authToken),
    );

    if (!consumedUserId || consumedUserId !== payload.sub) {
      throw new UnauthorizedException();
    }

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || !this.isUserActive(user)) {
      throw new UnauthorizedException('Account is not active');
    }

    const orgContext = await this.resolveOrgSessionContext(
      user.id,
      dto.organisationId,
    );

    const { accessToken, refreshToken } = await this.issueTokens(
      user,
      req,
      orgContext,
    );

    this.setTokenCookies(res, accessToken, refreshToken);

    return this.buildUserProfile(user, orgContext);
  }

  async validateLoginChallenge(authToken: string): Promise<LoginChallengeUser> {
    const payload = this.verifyLoginChallengeJwt(authToken);

    const storedUserId = await this.redisCache.getValue(
      this.loginChallengeKey(authToken),
    );

    if (!storedUserId || storedUserId !== payload.sub) {
      throw new UnauthorizedException();
    }

    return {
      id: payload.sub,
      email: payload.email,
    };
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
      const orgContext = await this.orgContextFromSession(graceSession);
      return this.toAuthenticatedUserFromUser(graceSession.user, orgContext);
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
            const orgContext = await this.orgContextFromSession(session);
            return {
              user: this.toAuthenticatedUserFromUser(session.user, orgContext),
            };
          }

          throw new UnauthorizedException();
        }

        if (!session.user || !this.isUserActive(session.user)) {
          throw new UnauthorizedException();
        }

        const orgContext = await this.orgContextFromSession(session);
        const newAccessToken = this.signAccessToken(session.user, orgContext);
        const newRefreshToken = randomUUID();

        session.previousRefreshTokenHash = refreshHash;
        session.refreshTokenHash = hashToken(newRefreshToken);
        session.refreshTokenGraceExpiresAt = new Date(
          Date.now() + ttlToMs(REFRESH_TOKEN_GRACE_PERIOD),
        );

        await manager.save(session);

        return {
          user: this.toAuthenticatedUserFromUser(session.user, orgContext),
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

  private async authenticateCredentials(
    email: string,
    password: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.password, password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!this.isUserActive(user)) {
      throw new UnauthorizedException('Account is not active');
    }

    return user;
  }

  private verifyLoginChallengeJwt(authToken: string): LoginChallengePayload {
    try {
      const payload =
        this.jwtService.verify<LoginChallengePayload>(authToken);

      if (payload.purpose !== LOGIN_CHALLENGE_PURPOSE) {
        throw new UnauthorizedException();
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException();
    }
  }

  private loginChallengeKey(authToken: string): string {
    return `${LOGIN_CHALLENGE_PREFIX}${hashToken(authToken)}`;
  }

  private async resolveOrgSessionContext(
    userId: string,
    organisationId?: string,
  ): Promise<OrgSessionContext> {
    if (organisationId) {
      const membership = await this.membershipsRepository.findOne({
        where: {
          userId,
          organisationId,
          status: 'active',
        },
      });

      if (!membership) {
        throw new UnauthorizedException();
      }

      return {
        organisationId: membership.organisationId,
        role: membership.role,
      };
    }

    const activeCount = await this.membershipsRepository.count({
      where: {
        userId,
        status: 'active',
      },
    });

    if (activeCount > 0) {
      throw new BadRequestException('organisationId is required');
    }

    return {
      organisationId: null,
      role: null,
    };
  }

  private async orgContextFromSession(
    session: Session,
  ): Promise<OrgSessionContext> {
    if (!session.organisationId) {
      return {
        organisationId: null,
        role: null,
      };
    }

    const membership = await this.membershipsRepository.findOne({
      where: {
        userId: session.user.id,
        organisationId: session.organisationId,
        status: 'active',
      },
    });

    if (!membership) {
      return {
        organisationId: null,
        role: null,
      };
    }

    return {
      organisationId: membership.organisationId,
      role: membership.role,
    };
  }

  private async buildUserProfile(
    user: User,
    orgContext: OrgSessionContext,
  ): Promise<UserProfileDto> {
    let organisation: UserProfileDto['organisation'] = null;

    if (orgContext.organisationId) {
      const org = await this.organisationsRepository.findOne({
        where: { id: orgContext.organisationId },
      });

      if (org) {
        organisation = { id: org.id, name: org.name };
      }
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      organisation,
      role: orgContext.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
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
    orgContext: OrgSessionContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken(user, orgContext);
    const refreshToken = randomUUID();
    const refreshTokenHash = hashToken(refreshToken);

    await this.sessionsRepository.save({
      user,
      refreshTokenHash,
      organisationId: orgContext.organisationId,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
      expiresAt: new Date(Date.now() + ttlToMs(REFRESH_TOKEN_TTL)),
    });

    return { accessToken, refreshToken };
  }

  private signAccessToken(user: User, orgContext: OrgSessionContext): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: orgContext.role,
      organisationId: orgContext.organisationId,
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
      role: payload.role ?? null,
      organisationId: payload.organisationId ?? null,
    };
  }

  private toAuthenticatedUserFromUser(
    user: User,
    orgContext: OrgSessionContext,
  ): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: orgContext.role,
      organisationId: orgContext.organisationId,
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
