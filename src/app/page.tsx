import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export default async function Home() {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    const dbUser = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: { favoriteMovie: true },
    });

    if (dbUser?.favoriteMovie) redirect("/dashboard");
    redirect("/onboarding");
  }

  const cookieHeader = cookies().toString();
  const host = headers().get("host") ?? "localhost:3004";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";

  // Auth.js requires a CSRF token for the provider sign-in POST.
  // If we omit it, Auth.js falls back to its intermediate `/api/auth/signin/csrf=true` page.
  const csrf = await fetch(`${proto}://${host}/api/auth/csrf`, {
    headers: { cookie: cookieHeader },
  }).then((r) => r.json().catch(() => null));

  return (
    <main className="page">
      <div className="container py-16">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              Movie Memory
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Save your favorite movie.
              <span className="text-blue-700"> Generate fun facts.</span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Sign in with Google, pick a favorite, and we’ll generate a new
              movie fact on demand (built to support caching + correctness
              later).
            </p>
          </div>

          <div className="card p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              Get started
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Sign in to continue to onboarding.
            </p>
            <div className="mt-6">
              <form action="/api/auth/signin/google" method="post">
                <input type="hidden" name="callbackUrl" value="/" />
                {csrf?.csrfToken ? (
                  <input type="hidden" name="csrfToken" value={csrf.csrfToken} />
                ) : null}
                <button type="submit" className="btn-primary w-full">
                  Sign in with Google
                </button>
              </form>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Your favorite movie is stored in Postgres.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

