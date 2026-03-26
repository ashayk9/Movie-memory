import Link from "next/link";
import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export default async function AuthDebugPage() {
  const currentUser = await getCurrentUser();
  const cookieHeader = cookies().toString();
  const host = headers().get("host") ?? "localhost:3004";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";

  const session = await fetch(`${proto}://${host}/api/auth/session`, {
    headers: { cookie: cookieHeader },
  })
    .then((r) => r.json())
    .catch(() => null);

  if (!currentUser) {
    return (
      <main className="min-h-screen p-6 bg-gray-50">
        <div className="max-w-2xl mx-auto rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-2">Auth Debug</h1>
          <p className="text-sm text-gray-700">
            Not authenticated (no userId in JWT session).
          </p>
          <pre className="mt-4 text-xs bg-gray-100 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(session, null, 2)}
          </pre>
          <Link
            href="/"
            className="inline-block mt-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
          >
            Go to Landing
          </Link>
        </div>
      </main>
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: currentUser.userId },
    select: {
      email: true,
      name: true,
      image: true,
      favoriteMovie: true,
      googleId: true,
    },
  });

  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-2xl mx-auto rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-4">Auth Debug</h1>
          <pre className="mt-2 text-xs bg-gray-100 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
            Session payload: {JSON.stringify(session, null, 2)}
          </pre>

        <div className="space-y-3 text-sm text-gray-800">
          <p>
            <span className="font-semibold">JWT userId:</span>{" "}
            {currentUser.userId}
          </p>
          <p>
            <span className="font-semibold">DB email:</span>{" "}
            {dbUser?.email ?? "(none)"}
          </p>
          <p>
            <span className="font-semibold">DB name:</span>{" "}
            {dbUser?.name ?? "(none)"}
          </p>
          <p>
            <span className="font-semibold">DB googleId:</span>{" "}
            {dbUser?.googleId ?? "(none)"}
          </p>
          <p>
            <span className="font-semibold">favoriteMovie:</span>{" "}
            {dbUser?.favoriteMovie ?? "(null)"}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/onboarding"
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
          >
            Go to Onboarding
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border px-4 py-2 hover:bg-gray-50"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

