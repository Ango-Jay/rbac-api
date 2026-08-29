import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';

type AuthenticatedRequest = Request & {
  user?: { id: string };
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getUserProfile(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException();
    }

    return this.usersService.getUserProfile(userId);
  }
}
