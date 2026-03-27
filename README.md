## Movie Memory

Save your favorite movie and generate fun facts on demand.

This repository is a **Next.js 13 App Router** project with:
- **Auth**: Google OAuth via **Auth.js** (`@auth/nextjs`) + CSRF-protected sign-in/out
- **DB**: Postgres + Prisma
- **Fact generation (Variant A)**: cache + correctness + concurrency lock + LLM fallback
- **API error contract**: standardized error envelope with `requestId`

## Getting Started

### Prerequisites

- **Node.js 20+** (Prisma + tooling requires modern Node)
- A Postgres database

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Copy the example file and fill values:

```bash
cp .env.local.example .env.local
```

Required:
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET`
- One of:
  - `OPENAI_API_KEY`
  - or `GROQ_API_KEY` (optional fallback)

Optional:
- `FACT_RATE_LIMIT_PER_MIN` (default `30`)

### 3) Apply Prisma schema to the database

If you are iterating locally and don’t need migration history:

```bash
npx prisma db push
npx prisma generate
```

If you want a clean reset (destructive, drops data):

```bash
npx prisma migrate reset
```

### 4) Run the dev server

```bash
npm run dev -- --port 3004
```

Open `http://localhost:3004`.

## Architecture

### Auth flow

- Auth handlers: `src/auth.ts` + `src/app/api/auth/[...nextauth]/route.ts`
- Client buttons:
  - `src/app/components/GoogleSignInButton.tsx`
  - `src/app/components/LogoutButton.tsx`
- Browser helper (CSRF + POST form submit): `src/lib/auth/browserAuth.ts`
- Server session utility: `src/lib/auth/getCurrentUser.ts` (uses `auth(Headers)`; no internal HTTP)

More details: see `Auth_flow.md`.

### Data model (Prisma)

Key tables:
- `User`
- `MovieFact`
- `FactGenerationLock` (unique `(userId, movieTitle)` for idempotency)

Lock status is modeled as enum `FactGenerationLockStatus`.

Schema: `prisma/schema.prisma`

### Fact generation (Variant A)

Implementation: `src/lib/facts/getFactForUserMovie.ts`

Behavior summary:
- **60s cache window** per `(userId, normalizedMovieTitle)`
- **Concurrency lock** using `FactGenerationLock` to avoid duplicate generations
- **Follower wait**: requests that lose the lock poll briefly for the newly created fact
- **Stale lock reclaim**: if a lock is older than `LOCK_TTL_MS`, a later request can reclaim it
- **Provider fallback**: OpenAI first if configured, then Groq (OpenAI-compatible)
- **Failure fallback**: if LLM fails but there is any existing fact, serve it as `fallback_cache`

### API endpoints

- `POST /api/onboarding`
  - Body: `FormData` (`movieTitle`)
  - Success: `{ ok: true }`
  - Updates `User.favoriteMovie`
- `POST /api/fact`
  - Body: JSON `{ movieTitle }`
  - Enforces **snapshot correctness**: requested title must equal stored favorite movie
  - Returns `{ factText, source }`

### Standard error contract

All API errors use the same JSON envelope:

```json
{
  "code": "SOME_CODE",
  "message": "Human readable message",
  "retryable": false,
  "retryAfterMs": null,
  "requestId": "uuid"
}
```

The response header also includes `x-request-id`.

Client parsing helper:
- `src/lib/api/clientError.ts`

Server response helper:
- `src/lib/api/response.ts`

### Rate limiting

`POST /api/fact` is rate-limited per user (in-memory sliding window).
- Default: 30 requests / minute / user
- Override: `FACT_RATE_LIMIT_PER_MIN`

For multi-instance production, replace with Redis/distributed rate limiting.

## Scripts

```bash
npm run dev
npm run lint
npm test
```

Typecheck:

```bash
npx tsc --noEmit
```

## Notes for reviewers

- Improvements and rationale: see `improvements.md`
- Auth deep-dive: see `Auth_flow.md`
