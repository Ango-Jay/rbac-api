# RBAC API (practice)

Practice NestJS implementation of a role-based access control API with organisations, memberships, and cookie-based JWT auth.

## Stack

- NestJS + TypeORM + PostgreSQL
- Redis (cache + BullMQ queues)
- Argon2 password hashing
- JWT access/refresh tokens in HTTP-only cookies

## Features

- Register with email OTP verification
- Multi-organisation login challenge
- Organisation member invite and accept flow
- Activity logs (BullMQ enqueue with DB fallback)
- Queued email notifications (sync send fallback if enqueue fails)

## Setup

From the repo root:

```bash
yarn install
cp server/.env.example server/.env
yarn db:up
```

`yarn db:up` starts Postgres and Redis via Docker Compose. Adjust `server/.env` if your hosts or credentials differ.

## Run

From the repo root:

```bash
yarn dev
```

Or from `server/`:

```bash
yarn start:dev
```

Other scripts (from `server/`):

```bash
yarn build
yarn start:prod
yarn migration:run
yarn test
```

API listens on `PORT` from `.env` (default `3000`).

## Main routes

**Auth** (`/auth`)

- `POST /auth/send-email-otp` — send signup OTP
- `POST /auth/register` — register (with OTP)
- `POST /auth/verify-credentials` — start login challenge
- `GET /auth/login/organisations` — list orgs for challenge token
- `POST /auth/login` — complete login (sets cookies)
- `POST /auth/logout` — clear session/cookies
- `POST /auth/accept-member-invite` — accept org invite and set password

**Organisations** (`/organisations`)

- `POST /organisations/members` — create/invite member (owner)
- `GET /organisations/members/invite` — invite details (`x-invite-token`)

**Users** (`/users`)

- `GET /users/profile` — current user profile (authenticated)
