import { NextResponse } from "next/server";
import { z } from "zod";

import { createRequestId, jsonError, jsonOk } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

const MovieSchema = z
  .string()
  .trim()
  .min(1, "Movie title is required")
  .max(100, "Movie title is too long");

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
  if (!currentUser.googleId) {
    return jsonError({
      status: 409,
      code: "SESSION_STALE",
      message:
        "Session is stale for onboarding. Please sign out and sign in again.",
      retryable: false,
      requestId,
    });
  }

  const formData = await request.formData();
  const raw = formData.get("movieTitle");
  const parsed = MovieSchema.safeParse(raw);

  if (!parsed.success) {
    return jsonError({
      status: 400,
      code: "INVALID_INPUT",
      message: parsed.error.flatten().formErrors.join(", "),
      retryable: false,
      requestId,
    });
  }

  const normalizedMovie = parsed.data.replace(/\s+/g, " ");

  try {
    // Use upsert so onboarding still works even if the DB was cleared
    // while the user is still signed in with a valid JWT cookie.
    await prisma.user.upsert({
      where: { googleId: currentUser.googleId },
      create: {
        // Keep id aligned with the JWT so downstream "find by id" still works.
        id: currentUser.userId,
        googleId: currentUser.googleId,
        email: currentUser.email ?? undefined,
        name: currentUser.name ?? undefined,
        image: currentUser.image ?? undefined,
        favoriteMovie: normalizedMovie,
      },
      update: {
        favoriteMovie: normalizedMovie,
        email: currentUser.email ?? undefined,
        name: currentUser.name ?? undefined,
        image: currentUser.image ?? undefined,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `[/api/onboarding] requestId=${requestId} unexpected error:`,
      message
    );
    return jsonError({
      status: 500,
      code: "UNKNOWN",
      message:
        process.env.NODE_ENV === "development"
          ? `Failed: ${message}`
          : "Failed to save favorite movie right now. Please try again.",
      retryable: true,
      retryAfterMs: null,
      requestId,
    });
  }

  return jsonOk({ ok: true }, requestId);
}

