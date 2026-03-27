"use client";

import { useState } from "react";
import { browserSignOut } from "@/lib/auth/browserAuth";

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
      await browserSignOut("/");
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

