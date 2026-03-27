import { NextAuth } from "@auth/nextjs";
import Google from "@auth/core/providers/google";
import type { JWT } from "@auth/core/jwt";
import type { Profile, Session, User } from "@auth/core/types";

import { prisma } from "@/lib/db/prisma";

type AppJwt = JWT & { userId?: string; googleId?: string };

function googleSubject(profile: Profile, user: User): string | undefined {
  const sub = profile.sub ?? profile.id ?? user.id;
  return typeof sub === "string" ? sub : undefined;
}

export const { handlers, auth } = NextAuth({
  providers: [
    // Nested @auth/core copy under @auth/nextjs can disagree on GoogleProfile vs Profile; runtime is fine.
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }) as never,
  ],
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,

  callbacks: {
    authorized: () => true,

    async jwt({ token, user, profile, account }) {
      const t = token as AppJwt;

      if (user && profile && account?.provider === "google") {
        const googleId = googleSubject(profile as Profile, user as User);
        if (!googleId) return token;

        const dbUser = await prisma.user.upsert({
          where: { googleId },
          update: {
            email: user.email ?? t.email,
            name: user.name ?? t.name,
            image: user.image ?? (typeof t.picture === "string" ? t.picture : null),
          },
          create: {
            googleId,
            email: user.email ?? t.email,
            name: user.name ?? t.name,
            image: user.image ?? (typeof t.picture === "string" ? t.picture : null),
          },
        });

        t.userId = dbUser.id;
        t.googleId = dbUser.googleId;
        return token;
      }

      if (t.userId && !t.googleId) {
        const row = await prisma.user.findUnique({
          where: { id: t.userId },
          select: { googleId: true },
        });
        if (row?.googleId) {
          t.googleId = row.googleId;
        }
      }

      return token;
    },

    session({ session, token }) {
      const t = token as AppJwt;
      const s = session as Session & {
        userId?: string;
        googleId?: string | null;
      };

      s.userId = t.userId;
      s.googleId = t.googleId ?? null;
      const u = (s.user ?? {}) as User & {
        userId?: string;
        googleId?: string | null;
      };
      u.userId = t.userId;
      u.googleId = t.googleId ?? null;
      s.user = u;

      return s;
    },
  },
});
