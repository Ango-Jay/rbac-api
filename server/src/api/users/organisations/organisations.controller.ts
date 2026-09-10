import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { USER_ROLES } from '../user.constants';
import { CreateMemberDto } from './dto/create-member.dto';
import { OrganisationsService } from './organisations.service';

@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly organisationsService: OrganisationsService) {}

  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLES.OWNER)
  createMember(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMemberDto,
  ) {
    return this.organisationsService.createMember(
      req.user.organisationId!,
      dto,
    );
  }
}
