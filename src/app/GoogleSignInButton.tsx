"use client";

import { useState } from "react";

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
      // Must be done in the browser so the authjs.csrf-token cookie is set.
      const csrfRes = await fetch("/api/auth/csrf", {
        method: "GET",
        credentials: "include",
      });

      const csrfData = (await csrfRes.json().catch(() => null)) as
        | { csrfToken?: string }
        | null;

      if (!csrfData?.csrfToken) {
        throw new Error("Missing csrfToken from /api/auth/csrf");
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/signin/google";

      const csrfInput = document.createElement("input");
      csrfInput.type = "hidden";
      csrfInput.name = "csrfToken";
      csrfInput.value = csrfData.csrfToken;

      const cbInput = document.createElement("input");
      cbInput.type = "hidden";
      cbInput.name = "callbackUrl";
      cbInput.value = callbackUrl;

      form.appendChild(csrfInput);
      form.appendChild(cbInput);
      document.body.appendChild(form);
      form.submit();
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

