export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
};

export type AuthenticatedRequest = import('express').Request & {
  user: AuthenticatedUser;
};
