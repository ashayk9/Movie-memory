"use client";

import { useState } from "react";

export default function LogoutButton({
  className,
}: {
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignOut() {
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
      // Keep callbackUrl behavior consistent with your current implementation.
      form.action = "/api/auth/signout?callbackUrl=/";

      const csrfInput = document.createElement("input");
      csrfInput.type = "hidden";
      csrfInput.name = "csrfToken";
      csrfInput.value = csrfData.csrfToken;

      form.appendChild(csrfInput);
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Logout failed");
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onSignOut}
        disabled={loading}
        className={className ?? "btn-ghost"}
      >
        {loading ? "Signing out..." : "Logout"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

