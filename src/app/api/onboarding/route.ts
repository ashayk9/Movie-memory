import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

const MovieSchema = z
  .string()
  .trim()
  .min(1, "Movie title is required")
  .max(100, "Movie title is too long");

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!currentUser.googleId) {
    // Usually happens if you cleared DB while an old auth cookie still exists.
    // Force re-auth so JWT/session + DB user row are recreated.
    return NextResponse.redirect(new URL("/", request.url), {
      status: 303,
    });
  }

  const formData = await request.formData();
  const raw = formData.get("movieTitle");
  const parsed = MovieSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors.join(", ") },
      { status: 400 },
    );
  }

  const normalizedMovie = parsed.data.replace(/\s+/g, " ");

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

  // Use 303 so the browser turns POST into a GET on redirect.
  return NextResponse.redirect(new URL("/dashboard", request.url), {
    status: 303,
  });
}

