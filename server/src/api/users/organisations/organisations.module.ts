import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from '../../../common/notification/notification.module';
import { AuthModule } from '../../auth/auth.module';
import { User } from '../entities/user.entity';
import { Organisation } from './entities/organisation.entity';
import { OrganisationMembership } from './entities/organisation-membership.entity';
import { OrganisationsController } from './organisations.controller';
import { OrganisationsService } from './organisations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organisation, OrganisationMembership, User]),
    forwardRef(() => AuthModule),
    NotificationModule,
  ],
  controllers: [OrganisationsController],
  providers: [OrganisationsService],
  exports: [TypeOrmModule, OrganisationsService],
})
export class OrganisationsModule {}
