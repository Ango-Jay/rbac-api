import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CompleteLoginDto } from './dto/complete-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { LoginChallengeGuard } from './guards/login-challenge.guard';
import type { LoginChallengeRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-email-otp')
  sendEmailOtp(@Body() dto: SendEmailOtpDto) {
    return this.authService.sendEmailOtp(dto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-credentials')
  verifyCredentials(@Body() dto: LoginDto) {
    return this.authService.verifyCredentials(dto);
  }

  @Get('login/organisations')
  @UseGuards(LoginChallengeGuard)
  getLoginOrganisations(@Req() req: LoginChallengeRequest) {
    return this.authService.getLoginOrganisations(req.user);
  }

  @Post('login')
  login(
    @Body() dto: CompleteLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, req, res);
  }

  @Post('logout')
  logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(req, res);
  }
}
