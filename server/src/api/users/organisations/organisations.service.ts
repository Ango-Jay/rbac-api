import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { USER_ROLES } from '../user.constants';
import { CreateMemberDto } from './dto/create-member.dto';
import { OrganisationMembership } from './entities/organisation-membership.entity';

export type CreatedMember = {
  id: string;
  userId: string;
  email: string;
  role: string;
  status: string;
};

@Injectable()
export class OrganisationsService {
  constructor(
    @InjectRepository(OrganisationMembership)
    private readonly membershipsRepository: Repository<OrganisationMembership>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
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

  async createMember(
    organisationId: string,
    dto: CreateMemberDto,
  ): Promise<CreatedMember> {
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
        throw new ConflictException('User is already a member of this organisation');
      }

      // Pending until the user creates a password.
      const membership = await this.membershipsRepository.save(
        this.membershipsRepository.create({
          userId: existingUser.id,
          organisationId,
          role: USER_ROLES.MEMBER,
          status: 'pending',
        }),
      );

      return {
        id: membership.id,
        userId: existingUser.id,
        email: existingUser.email,
        role: membership.role,
        status: membership.status,
      };
    }

    return this.dataSource.transaction(async (manager) => {
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
  }
}
