import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/db/prisma";

export type CurrentUser = {
  userId: string;
  googleId?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieHeader = cookies().toString();
  const host = headers().get("host") ?? "localhost:3004";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";

  // Calling the session endpoint ensures we use the incoming cookies.
  const res = await fetch(`${proto}://${host}/api/auth/session`, {
    headers: {
      cookie: cookieHeader,
    },
  });

  const session = (await res.json().catch(() => null)) as any;
  if (!session) return null;

  const userId =
    session.userId ??
    session?.user?.userId ??
    session?.auth?.userId ??
    session?.token?.userId;

  const googleId =
    session.googleId ??
    session?.user?.googleId ??
    session?.auth?.googleId ??
    session?.token?.googleId ??
    null;

  if (!userId) return null;

  // Session payload may not include provider identifiers like `googleId`.
  // For Variant A onboarding/fact logic we need it to upsert safely.
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleId: true, email: true, name: true, image: true },
  });

  return {
    userId,
    googleId: googleId ?? dbUser?.googleId ?? null,
    email: session?.user?.email ?? session?.email ?? dbUser?.email ?? null,
    name: session?.user?.name ?? session?.name ?? dbUser?.name ?? null,
    image:
      session?.user?.image ?? session?.picture ?? session?.image ?? dbUser?.image ?? null,
  };
}

