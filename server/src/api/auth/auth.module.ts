import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Organisation } from '../users/organisations/entities/organisation.entity';
import { OrganisationMembership } from '../users/organisations/entities/organisation-membership.entity';
import { OrganisationsModule } from '../users/organisations/organisations.module';
import { NotificationModule } from '../../common/notification/notification.module';
import { ACCESS_TOKEN_TTL } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginChallengeGuard } from './guards/login-challenge.guard';
import { Session } from './sessions/entities/session.entity';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    PassportModule,
    SessionsModule,
    OrganisationsModule,
    NotificationModule,
    TypeOrmModule.forFeature([User, Session, Organisation, OrganisationMembership]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('auth.jwtSecret'),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, LoginChallengeGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
