import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import type { LoginChallengeRequest } from '../auth.types';

@Injectable()
export class LoginChallengeGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LoginChallengeRequest>();
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const authToken = authorization.slice('Bearer '.length).trim();
    if (!authToken) {
      throw new UnauthorizedException();
    }

    req.user = await this.authService.validateLoginChallenge(authToken);
    return true;
  }
}
