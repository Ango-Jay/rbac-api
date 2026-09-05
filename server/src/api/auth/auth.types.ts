import { LOGIN_CHALLENGE_PURPOSE } from './auth.constants';
import type { Request } from 'express';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string | null;
  organisationId: string | null;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: string | null;
  organisationId: string | null;
};

export type LoginChallengePayload = {
  sub: string;
  email: string;
  purpose: typeof LOGIN_CHALLENGE_PURPOSE;
};

export type LoginChallengeUser = {
  id: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export type LoginChallengeRequest = Request & {
  user: LoginChallengeUser;
};
