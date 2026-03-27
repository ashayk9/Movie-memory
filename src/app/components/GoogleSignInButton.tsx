"use client";

import { useState } from "react";
import { browserSignInGoogle } from "@/lib/auth/browserAuth";

export default function GoogleSignInButton({
  callbackUrl,
  className,
}: {
  callbackUrl: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setLoading(true);
    setError(null);

    try {
      await browserSignInGoogle(callbackUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onSignIn}
        disabled={loading}
        className={className ?? "btn-primary w-full"}
      >
        {loading ? "Signing in..." : "Sign in with Google"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

