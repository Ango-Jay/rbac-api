import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserProfileDto } from './dto/user-profile.dto';
import { User } from './entities/user.entity';
import { Organisation } from './organisations/entities/organisation.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Organisation)
    private readonly organisationsRepository: Repository<Organisation>,
  ) {}

  async getUserProfile(authUser: AuthenticatedUser): Promise<UserProfileDto> {
    const user = await this.usersRepository.findOne({
      where: { id: authUser.id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let organisation: UserProfileDto['organisation'] = null;

    if (authUser.organisationId) {
      const org = await this.organisationsRepository.findOne({
        where: { id: authUser.organisationId },
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
      role: authUser.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
