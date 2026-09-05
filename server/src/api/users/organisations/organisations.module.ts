import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organisation } from './entities/organisation.entity';
import { OrganisationMembership } from './entities/organisation-membership.entity';
import { OrganisationsService } from './organisations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Organisation, OrganisationMembership])],
  providers: [OrganisationsService],
  exports: [TypeOrmModule, OrganisationsService],
})
export class OrganisationsModule {}
