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
                Onboarding
              </h1>
              <p className="mt-2 text-sm text-slate-600">
            You already set your favorite movie. Redirecting you to the
            dashboard.
          </p>
          <a
            href="/dashboard"
                className="btn-primary mt-6 w-full"
          >
            Go to Dashboard
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Pick your favorite movie
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  We’ll use it to personalize your dashboard and generate fun
                  facts.
                </p>
              </div>
              <a href="/" className="btn-ghost shrink-0">
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

