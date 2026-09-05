export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string | null;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: string | null;
};

export type AuthenticatedRequest = import('express').Request & {
  user: AuthenticatedUser;
};
