import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/db/prisma";
import { generateMovieFactBase } from "@/lib/facts/generateMovieFactBase";

const BodySchema = z.object({
  movieTitle: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors.movieTitle?.[0] ?? "Invalid input" },
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
      { error: "Favorite movie not set. Please complete onboarding." },
      { status: 400 },
    );
  }

  // Enforce snapshot correctness: only generate for the user's currently saved favorite.
  const normalizedStored = dbUser.favoriteMovie.replace(/\s+/g, " ");
  if (normalizedRequested !== normalizedStored) {
    return NextResponse.json(
      { error: "Movie title does not match your saved favorite movie." },
      { status: 400 },
    );
  }

  try {
    const result = await generateMovieFactBase({
      userId: currentUser.userId,
      movieTitle: normalizedStored,
    });
    return NextResponse.json({
      factText: result.factText,
      source: result.source,
    });
  } catch (e) {
    // Base impl: no special fallback yet (Variant A will add cached fallback).
    const message = e instanceof Error ? e.message : String(e);
    console.error("[/api/fact] generateMovieFactBase failed:", message);

    if (message === "FACT_GENERATION_IN_PROGRESS") {
      return NextResponse.json(
        { error: "Fact generation in progress. Please try again in a second." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? `Failed: ${message}`
            : "Failed to generate a fact right now. Please try again.",
      },
      { status: 500 }
    );
  }
}

