import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

import FactGenerator from "./FactGenerator";
import LogoutButton from "../components/LogoutButton";
import Image from "next/image";

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/");

  const dbUser = await prisma.user.findUnique({
    where: { id: currentUser.userId },
    select: {
      name: true,
      email: true,
      image: true,
      favoriteMovie: true,
    },
  });

  if (!dbUser?.favoriteMovie) {
    return (
      <main className="page">
        <div className="container py-10">
          <div className="mx-auto max-w-3xl card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600">
            Favorite movie is missing. Please complete onboarding.
          </p>
            <div className="mt-6">
              <a href="/onboarding" className="btn-primary">
                Go to Onboarding
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const latestFact = await prisma.movieFact.findFirst({
    where: {
      userId: currentUser.userId,
      movieTitle: dbUser.favoriteMovie,
    },
    orderBy: { createdAt: "desc" },
    select: { factText: true },
  });

  return (
    <main className="page">
      <div className="container py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="card p-6 sm:p-8">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
            {dbUser.image ? (
              <div className="relative h-14 w-14 overflow-hidden rounded-full bg-gray-200">
                <Image
                  src={dbUser.image}
                  alt="User photo"
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold">
                {(dbUser.name?.[0] ?? "U").toUpperCase()}
              </div>
            )}

                <div>
                  <h1 className="text-xl font-semibold text-slate-900">
                {dbUser.name ?? "User"}
              </h1>
                  <p className="mt-0.5 text-sm text-slate-600">{dbUser.email}</p>
                </div>
              </div>

              <LogoutButton className="btn-ghost" />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="card-muted p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Favorite movie
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {dbUser.favoriteMovie}
                </p>
              </div>

              <div className="card-muted p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Account
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  Signed in with Google
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6 sm:p-8">
            <FactGenerator
              movieTitle={dbUser.favoriteMovie}
              initialFactText={latestFact?.factText ?? null}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

