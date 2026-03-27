import { cookies } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

import { readAppSessionFields } from "./sessionTypes";

export type CurrentUser = {
  userId: string;
  googleId?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

/**
 * Server-side session via Auth.js `auth(Headers)` (same contract as /api/auth/session, no internal HTTP).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const h = new Headers();
  h.set("cookie", cookies().toString());

  const raw = await auth(h);
  const fields = readAppSessionFields(raw);
  if (!fields) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: fields.userId },
    select: { googleId: true, email: true, name: true, image: true },
  });

  return {
    userId: fields.userId,
    googleId: fields.googleId ?? dbUser?.googleId ?? null,
    email: fields.email ?? dbUser?.email ?? null,
    name: fields.name ?? dbUser?.name ?? null,
    image: fields.image ?? dbUser?.image ?? null,
  };
}
