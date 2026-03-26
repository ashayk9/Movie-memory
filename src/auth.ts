import { NextAuth } from "@auth/nextjs";
import Google from "@auth/core/providers/google";

import { prisma } from "@/lib/db/prisma";

export const { handlers, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  // Variant A does not depend on auth persistence; JWT keeps setup simple.
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,

  callbacks: {
    // Runs on sign-in/up to persist your app user id into the JWT.
    // On subsequent requests, `user`/`profile` are absent — those calls must still
    // return an enriched token (e.g. backfill `googleId` for older JWTs).
    async jwt({ token, user, profile, account, trigger }) {
      const anyToken = token as any;

      if (user && profile && account?.provider === "google") {
        // For Google OIDC, the subject is stable and maps to `googleId`.
        const googleId =
          (profile as any).sub ?? (profile as any).id ?? (user as any).id;

        if (!googleId) return token;

        const dbUser = await prisma.user.upsert({
          where: { googleId },
          update: {
            email: (user as any).email ?? token.email,
            name: (user as any).name ?? token.name,
            image: (user as any).image ?? token.picture,
          },
          create: {
            googleId,
            email: (user as any).email ?? token.email,
            name: (user as any).name ?? token.name,
            image: (user as any).image ?? token.picture,
          },
        });

        anyToken.userId = dbUser.id;
        anyToken.googleId = dbUser.googleId;
        return token;
      }

      // Older sessions only had `userId` in the JWT; hydrate `googleId` from DB.
      if (anyToken.userId && !anyToken.googleId) {
        const row = await prisma.user.findUnique({
          where: { id: anyToken.userId },
          select: { googleId: true },
        });
        if (row?.googleId) {
          anyToken.googleId = row.googleId;
        }
      }

      return token;
    },

    // Expose `userId` to the session response so server components can use it.
    session({ session, token }) {
      const anySession = session as any;
      const anyToken = token as any;
      anySession.userId = anyToken.userId;

      // Auth.js typically exposes a limited set of fields in `session.user`.
      // We add provider identifiers so server actions/pages can upsert safely.
      anySession.googleId = anyToken.googleId;
      anySession.user = anySession.user ?? {};
      anySession.user.userId = anyToken.userId;
      anySession.user.googleId = anyToken.googleId;
      return session;
    },
  },
});

