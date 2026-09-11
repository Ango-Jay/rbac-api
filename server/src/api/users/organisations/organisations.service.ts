import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { NotificationService } from '../../../common/notification/notification.service';
import { User } from '../entities/user.entity';
import { USER_ROLES } from '../user.constants';
import { CreateMemberDto } from './dto/create-member.dto';
import { Organisation } from './entities/organisation.entity';
import { OrganisationMembership } from './entities/organisation-membership.entity';

const MEMBER_INVITE_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export type CreatedMember = {
  id: string;
  userId: string;
  email: string;
  role: string;
  status: string;
};

export type MemberInviteDetails = {
  email: string;
  firstName: string;
  lastName: string;
  organisationName: string;
  role: string;
  status: string;
};

@Injectable()
export class OrganisationsService {
  constructor(
    @InjectRepository(OrganisationMembership)
    private readonly membershipsRepository: Repository<OrganisationMembership>,
    @InjectRepository(Organisation)
    private readonly organisationsRepository: Repository<Organisation>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  async getOrganisationsForUser(
    userId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const memberships = await this.membershipsRepository.find({
      where: {
        userId,
        status: 'active',
      },
      relations: { organisation: true },
    });

    return memberships.map((membership) => ({
      id: membership.organisation.id,
      name: membership.organisation.name,
    }));
  }

  async getOrganisationsByIds(
    organisationIds: string[],
  ): Promise<Array<{ id: string; name: string }>> {
    if (organisationIds.length === 0) {
      return [];
    }

    const memberships = await this.membershipsRepository.find({
      where: {
        organisationId: In(organisationIds),
        status: 'active',
      },
      relations: { organisation: true },
    });

    const uniqueByOrg = new Map<string, { id: string; name: string }>();
    for (const membership of memberships) {
      uniqueByOrg.set(membership.organisation.id, {
        id: membership.organisation.id,
        name: membership.organisation.name,
      });
    }

    return organisationIds
      .map((id) => uniqueByOrg.get(id))
      .filter((org): org is { id: string; name: string } => Boolean(org));
  }

  async getMemberInviteDetails(
    inviteToken: string,
  ): Promise<MemberInviteDetails> {
    const membership = await this.findValidPendingInvite(inviteToken);

    return {
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      organisationName: membership.organisation.name,
      role: membership.role,
      status: membership.status,
    };
  }

  async createMember(
    organisationId: string,
    dto: CreateMemberDto,
  ): Promise<CreatedMember> {
    const organisation = await this.organisationsRepository.findOne({
      where: { id: organisationId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    const existingUser = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      const existingMembership = await this.membershipsRepository.findOne({
        where: {
          userId: existingUser.id,
          organisationId,
        },
      });

      if (existingMembership) {
        throw new ConflictException(
          'User is already a member of this organisation',
        );
      }

      // Pending until the user creates a password.
      const invite = this.buildInviteFields();
      const membership = await this.membershipsRepository.save(
        this.membershipsRepository.create({
          userId: existingUser.id,
          organisationId,
          role: USER_ROLES.MEMBER,
          status: 'pending',
          ...invite,
        }),
      );

      await this.sendMemberInviteEmail(
        existingUser.email,
        organisation.name,
        invite.inviteToken,
      );

      return {
        id: membership.id,
        userId: existingUser.id,
        email: existingUser.email,
        role: membership.role,
        status: membership.status,
      };
    }

    const invite = this.buildInviteFields();

    const created = await this.dataSource.transaction(async (manager) => {
      // User/membership stay pending until the user creates a password.
      const user = await manager.save(
        manager.create(User, {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          password: null,
          status: 'pending',
        }),
      );

      const membership = await manager.save(
        manager.create(OrganisationMembership, {
          userId: user.id,
          organisationId,
          role: USER_ROLES.MEMBER,
          status: 'pending',
          ...invite,
        }),
      );

      return {
        id: membership.id,
        userId: user.id,
        email: user.email,
        role: membership.role,
        status: membership.status,
      };
    });

    await this.sendMemberInviteEmail(
      created.email,
      organisation.name,
      invite.inviteToken,
    );

    return created;
  }

  private buildInviteFields(): {
    inviteToken: string;
    inviteExpiresAt: Date;
  } {
    return {
      inviteToken: randomUUID(),
      inviteExpiresAt: new Date(Date.now() + MEMBER_INVITE_TTL_MS),
    };
  }

  private async sendMemberInviteEmail(
    email: string,
    organisationName: string,
    inviteToken: string,
  ): Promise<void> {
    const clientBaseUrl = this.configService.getOrThrow<string>('clientBaseUrl');
    const inviteUrl = `${clientBaseUrl}/signup/member_invite?id=${inviteToken}`;

    await this.notificationService.notifyEmail({
      to: email,
      subject: `You have been invited to join ${organisationName}`,
      body: `You have been invited to join ${organisationName}. Accept your invite: ${inviteUrl}`,
    });

    await this.notificationService.notifyLog({
      level: 'log',
      context: 'MemberInvite',
      message: `member invite for ${email} to ${organisationName}: ${inviteUrl}`,
    });
  }

  private async findValidPendingInvite(
    inviteToken: string,
  ): Promise<OrganisationMembership> {
    const membership = await this.membershipsRepository.findOne({
      where: {
        inviteToken,
        status: 'pending',
      },
      relations: { user: true, organisation: true },
    });

    if (
      !membership ||
      !membership.inviteExpiresAt ||
      membership.inviteExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }

    return membership;
  }
}
