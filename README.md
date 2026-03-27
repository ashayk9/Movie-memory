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

## Scripts

```bash
npm run dev
npm run lint
npm test
```
## 1) Product and system goal (simple)

The app does three core things:
1. Sign users in with Google
2. Let each user save one favorite movie
3. Generate movie facts on demand

Variant A adds backend correctness:
- 60-second caching
- burst/idempotency protection
- fallback behavior when LLM fails

## 2) Big architecture decisions

### Decision A: Backend is source of truth for caching and correctness

**What we chose**
- Cache logic is in backend (`getFactForUserMovie`), not in frontend.

**Why**
- Multiple clients/tabs can hit the backend.
- Backend has DB visibility and can enforce correctness globally.
- Avoids duplicate or conflicting cache logic in UI.
- Same source of truth for one user across tabs (and refreshes)

**Tradeoff**
- Extra network round trip vs a purely client cache

### Decision B: Append-only `MovieFact` table

**What we chose**
- Every generation creates a new row in `MovieFact`.

**Why**
- Easy to get latest fact by timestamp.
- Gives natural fallback source if LLM fails.
- Preserves history for debugging/auditing.

**Tradeoff**
- Table grows over time
- Requires eventual retention/cleanup policy in production.

**Current implementation detail**
- We now keep only the latest 5 facts per `(userId, movieTitle)` in the hot table after each new generation.


---

### Decision C: DB-backed lock for idempotency (`FactGenerationLock`)

**What we chose**
- Lock key is `(userId, movieTitle)` with DB unique constraint.

**Why**
- Prevents multiple concurrent LLM calls for same user/movie.
- Works across browser tabs and concurrent requests.
- More reliable than in-memory lock for correctness.

**Tradeoff**
- Extra table and lock lifecycle logic(create, complete, stale reclaim).
- Need stale-lock recovery and cleanup.

**Alternatives considered**
1. In-memory lock
   - simpler, but not safe across multiple instances
2. Per-window unique fact key
   - simpler dedupe, less explicit lock lifecycle
3. Transaction-only guard
   - stronger atomicity, can be heavier and more complex



---

### Decision D: Stale lock reclaim with TTL

**What we chose**
- Lock has `updatedAt`; if too old (`LOCK_TTL_MS`), a new request can reclaim.

**Why**
- Prevents deadlock if previous request crashed after acquiring lock.

**Tradeoff**
- Slightly more logic and edge-case handling.

**If asked**
- "How do you avoid double reclaim?"  
  Reclaim uses conditional update on known lock timestamp; only one request wins.

---

### Decision E: Follower waiting + re-check

**What we chose**
- If lock is taken, follower waits with bounded backoff and re-checks latest fact.

**Why**
- Avoids duplicate generation while still returning fresh result soon.

**Tradeoff**
- Extra DB reads during contention.

**Possible hardening**
- Add jitter to reduce synchronized polling spikes.

---

### Decision F: Failure fallback to cached fact

**What we chose**
- If LLM fails and any previous fact exists, return it (`fallback_cache`).

**Why**
- Better UX than hard failure when possible.
- Keeps endpoint useful during transient provider issues.

**Tradeoff**
- Returned fact may be older than cache window.

**How to explain**
- "Freshness is preferred, availability is second; fallback is deliberate for resilience."

---





### Decision G: Throttling deferred to scale phase

**What we chose**
- No active runtime limiter in the final take-home flow.

**Why**
- Cached calls are cheap and frequent during demo/testing.
- Hard throttling in this stage created UX/testing friction without adding core Variant A correctness value.

**Tradeoff**
- No immediate abuse/cost cap in runtime.
- Requires clear future plan for production traffic.

**Production next step**
- Redis/distributed limiter, preferably token bucket.

**Why token bucket at scale**
- Allows small bursts (better user experience than strict fixed windows).
- Preserves stable average throughput to control LLM cost and backend load.
- Works well with multi-instance deployments when state is in Redis.


---

### Decision H: Keep request-synchronous now, consider queue at scale

**What we chose now**
- Fact generation happens in the same `POST /api/fact` request lifecycle.
- We use lock + cache + fallback to keep this safe under moderate burst traffic.

**Why this is correct now**
- Simpler architecture for the scope.
- Good correctness and UX tradeoff for current expected load.

**When queue becomes better**
- p95/p99 request latency grows too high
- contention retries become frequent
- LLM/provider slowness threatens request timeouts
- need durable retries/DLQ and stronger throughput controls

**Queue model in simple words**
- API accepts request and creates a job (`202 + jobId`).
- Worker processes job in background.
- UI polls job status (or receives push update) for final result.



---

## 3) Why schema is designed this way (simple + detailed)

### `User`
- Purpose: identity + profile + onboarding state.
- `googleId` unique to map OAuth identity reliably.
- `favoriteMovie` nullable until onboarding.

### `MovieFact`
- Purpose: fact history by user and movie snapshot.
- Index `(userId, movieTitle, createdAt)` supports "latest fact" lookup.
- Recent append-only history supports cache + fallback semantics cleanly.
- Operational retention is bounded to latest 5 per key.

### `FactGenerationLock`
- Purpose: concurrency control key for single-flight generation.
- Unique `(userId, movieTitle)` is the idempotency boundary.
- `status` enum improves type safety and lock-state clarity.

---

## 4) Caching strategy

1. Normalize movie title input (`trim` + collapse whitespace).
2. Read latest fact for `(userId, movieTitle)`.
3. If age < 60s, return cached fact.
4. Else coordinate generation through lock.
5. Re-check cache after lock acquisition to avoid race.
6. Generate/store only if still stale.

**Why this is correct**
- Guarantees fresh-enough responses when possible.
- Prevents duplicate generations under bursts.
- Handles failures without fully breaking UX.

## Immediate improvements

1. Auth package stability/type workaround
   - Currently uses older prerelease line and a cast workaround.
   - Works, but should be aligned to stable package line next.

2. Redis-based distributed token-bucket rate limiting



## 5) Scalability roadmap (phased)

### Phase 1: Distributed rate limiting

**What to change**
- limiter with Redis token bucket.

**Why first**
- for API throttling and burst control

**Tradeoff**
- Adds Redis dependency and operational overhead.

---

### Phase 2: Better observability and SLOs

**What to add**
- Metrics:
  - cache hit ratio
  - lock conflicts
  - stale lock reclaims
  - fallback_cache ratio
  - 429 rate
  - LLM latency and error rate
- Structured logs with `requestId`, user key hash, endpoint, outcome code

**Why**
- Enables data-driven scaling decisions instead of guesswork.

**Tradeoff**
- Slight complexity increase

---

### Phase 3: Queue-based async generation (higher complexity, higher scale)

**What to change**
- API enqueues job and returns quickly (`202 Accepted` + `jobId`)
- Worker consumes queue and performs generation
- UI polls job status endpoint (or receives push updates)

**Why**
- Better burst absorption
- Cleaner request latency under provider slowness
- Better retry/dead-letter handling at scale

**Important**
- Queue does not remove idempotency needs.
- Use idempotency key + worker-side claim/state.

**Tradeoff**
- More infrastructure and asynchronous UX complexity.

---

## Summary
"This app uses a backend-first correctness model for fact generation. Facts are cached for 60 seconds per user+movie, and a DB-backed lock prevents duplicate generation bursts. Non-owners wait and re-check, stale locks are reclaimed by TTL, and LLM failures gracefully fall back to latest cached fact. API errors are standardized with requestId for consistent client behavior and easier debugging. The main remaining hardening step is auth dependency alignment to a stable release line."

## AI usage

Short note on how AI tooling was used in this project:

- **Implementation help**: Used an AI coding assistant (Cursor) to draft and iterate on TypeScript/React/Prisma code, API routes, and tests—then **reviewed, adjusted, and verified** behavior locally.
- **Debugging**: Used AI to narrow down errors and implement fixes; 
- **Documentation**: Used AI to **outline and refine** README 
- **Ownership**: Architectural choices (Variant A, big design decisions, lock model, error envelope) were **decided and validated by me**; AI accelerated typing and exploration, not unreviewed copy-paste.


