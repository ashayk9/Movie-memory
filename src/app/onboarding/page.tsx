import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/");

  const dbUser = await prisma.user.findUnique({
    where: { id: currentUser.userId },
    select: { favoriteMovie: true },
  });

  if (dbUser?.favoriteMovie) {
    return (
      <main className="page">
        <div className="container py-16">
          <div className="mx-auto w-full max-w-xl">
            <div className="card p-6 sm:p-8">
              <h1 className="text-2xl font-semibold text-slate-900">
                Favorite movie already saved
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                You can continue to your dashboard.
              </p>
              <a href="/dashboard" className="btn-primary mt-6 w-full">
                Go to dashboard
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container py-16">
        <div className="mx-auto w-full max-w-xl">
          <div className="card p-6 sm:p-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Pick your favorite movie
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  We use this to personalize your dashboard and fact generation.
                </p>
              </div>
              <a href="/" className="btn-ghost w-full shrink-0 sm:w-auto">
                Back
              </a>
            </div>

            <OnboardingForm />
          </div>
        </div>
      </div>
    </main>
  );
}

