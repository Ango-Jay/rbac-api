import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganisationMembership } from './entities/organisation-membership.entity';

@Injectable()
export class OrganisationsService {
  constructor(
    @InjectRepository(OrganisationMembership)
    private readonly membershipsRepository: Repository<OrganisationMembership>,
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
}
