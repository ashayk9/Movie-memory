import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/db/prisma";
import { AppError, RateLimitedError } from "@/lib/facts/errors";
import { getFactForUserMovie } from "@/lib/facts/getFactForUserMovie";
import { consumeFactRateLimit } from "@/lib/rateLimit/factRateLimit";

const BodySchema = z.object({
  movieTitle: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  const rate = consumeFactRateLimit(currentUser.userId);
  if (!rate.ok) {
    const e = new RateLimitedError(rate.retryAfterMs);
    return NextResponse.json(
      {
        error: e.message,
        code: e.code,
        retryable: e.retryable,
        retryAfterMs: e.retryAfterMs ?? null,
      },
      {
        status: e.status,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
        },
      }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.flatten().fieldErrors.movieTitle?.[0] ?? "Invalid input",
        code: "INVALID_INPUT",
        retryable: false,
      },
      { status: 400 },
    );
  }

  const normalizedRequested = parsed.data.movieTitle.replace(/\s+/g, " ");

  const dbUser = await prisma.user.findUnique({
    where: { id: currentUser.userId },
    select: { favoriteMovie: true },
  });

  if (!dbUser?.favoriteMovie) {
    return NextResponse.json(
      {
        error: "Favorite movie not set. Please complete onboarding.",
        code: "FAVORITE_MOVIE_NOT_SET",
        retryable: false,
      },
      { status: 400 },
    );
  }

  // Enforce snapshot correctness: only generate for the user's currently saved favorite.
  const normalizedStored = dbUser.favoriteMovie.replace(/\s+/g, " ");
  if (normalizedRequested !== normalizedStored) {
    return NextResponse.json(
      {
        error: "Movie title does not match your saved favorite movie.",
        code: "MOVIE_MISMATCH",
        retryable: false,
      },
      { status: 400 },
    );
  }

  try {
    const result = await getFactForUserMovie({
      userId: currentUser.userId,
      movieTitle: normalizedStored,
    });
    return NextResponse.json({
      factText: result.factText,
      source: result.source,
    });
  } catch (e) {
    if (e instanceof AppError) {
      // Expected, typed failures (in-progress, provider down, misconfig, etc.)
      if (process.env.NODE_ENV === "development") {
        console.info(`[/api/fact] ${e.code}: ${e.message}`);
      }
      const res = NextResponse.json(
        {
          error: e.message,
          code: e.code,
          retryable: e.retryable,
          retryAfterMs: e.retryAfterMs ?? null,
        },
        { status: e.status }
      );
      if (e.retryAfterMs != null) {
        // Retry-After is seconds (HTTP spec).
        res.headers.set("Retry-After", String(Math.ceil(e.retryAfterMs / 1000)));
      }
      return res;
    }

    const message = e instanceof Error ? e.message : String(e);
    console.error("[/api/fact] unexpected error:", message);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? `Failed: ${message}`
            : "Failed to generate a fact right now. Please try again.",
        code: "UNKNOWN",
        retryable: true,
        retryAfterMs: null,
      },
      { status: 500 }
    );
  }
}

