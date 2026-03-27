import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, createRequestId } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/db/prisma";
import { AppError, RateLimitedError } from "@/lib/facts/errors";
import { getFactForUserMovie } from "@/lib/facts/getFactForUserMovie";
import { consumeFactRateLimit } from "@/lib/rateLimit/factRateLimit";

const BodySchema = z.object({
  movieTitle: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const requestId = createRequestId();

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return jsonError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      retryable: false,
      requestId,
    });
  }

  const rate = consumeFactRateLimit(currentUser.userId);
  if (!rate.ok) {
    const e = new RateLimitedError(rate.retryAfterMs);
    return jsonError({
      status: e.status,
      code: e.code,
      message: e.message,
      retryable: e.retryable,
      retryAfterMs: e.retryAfterMs ?? null,
      requestId,
      headers: {
        "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
      },
    });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError({
      status: 400,
      code: "INVALID_INPUT",
      message:
        parsed.error.flatten().fieldErrors.movieTitle?.[0] ?? "Invalid input",
      retryable: false,
      requestId,
    });
  }

  const normalizedRequested = parsed.data.movieTitle.replace(/\s+/g, " ");

  const dbUser = await prisma.user.findUnique({
    where: { id: currentUser.userId },
    select: { favoriteMovie: true },
  });

  if (!dbUser?.favoriteMovie) {
    return jsonError({
      status: 400,
      code: "FAVORITE_MOVIE_NOT_SET",
      message: "Favorite movie not set. Please complete onboarding.",
      retryable: false,
      requestId,
    });
  }

  // Enforce snapshot correctness: only generate for the user's currently saved favorite.
  const normalizedStored = dbUser.favoriteMovie.replace(/\s+/g, " ");
  if (normalizedRequested !== normalizedStored) {
    return jsonError({
      status: 400,
      code: "MOVIE_MISMATCH",
      message: "Movie title does not match your saved favorite movie.",
      retryable: false,
      requestId,
    });
  }

  try {
    const result = await getFactForUserMovie({
      userId: currentUser.userId,
      movieTitle: normalizedStored,
    });
    return jsonOk({
      factText: result.factText,
      source: result.source,
    }, requestId);
  } catch (e) {
    if (e instanceof AppError) {
      const retryAfterHeader =
        e.retryAfterMs != null
          ? { "Retry-After": String(Math.ceil(e.retryAfterMs / 1000)) }
          : undefined;
      if (process.env.NODE_ENV === "development") {
        console.info(`[/api/fact] requestId=${requestId} ${e.code}: ${e.message}`);
      }
      return jsonError({
        status: e.status,
        code: e.code,
        message: e.message,
        retryable: e.retryable,
        retryAfterMs: e.retryAfterMs ?? null,
        requestId,
        headers: retryAfterHeader,
      });
    }

    const message = e instanceof Error ? e.message : String(e);
    console.error(`[/api/fact] requestId=${requestId} unexpected error:`, message);
    return jsonError({
      status: 500,
      code: "UNKNOWN",
      message:
        process.env.NODE_ENV === "development"
          ? `Failed: ${message}`
          : "Failed to generate a fact right now. Please try again.",
      retryable: true,
      retryAfterMs: null,
      requestId,
    });
  }
}

