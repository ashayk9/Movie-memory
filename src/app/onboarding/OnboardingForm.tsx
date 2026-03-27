"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  formatErrorWithRequestId,
  formatRetryAfter,
  parseApiError,
} from "@/lib/api/clientError";

export default function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRetryHint(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const movieTitle = String(formData.get("movieTitle") ?? "");

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const apiErr = await parseApiError(res);
        const msg = apiErr?.message ?? "Failed to save favorite movie";
        setRetryHint(formatRetryAfter(apiErr?.retryAfterMs));
        throw new Error(formatErrorWithRequestId(msg, apiErr?.requestId));
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="label">Favorite movie</span>
        <input
          name="movieTitle"
          type="text"
          placeholder="e.g. The Matrix"
          className="input mt-2"
          required
          minLength={1}
          maxLength={100}
          disabled={loading}
        />
        <p className="help mt-2">
          Tip: be specific (sequels, subtitles). Max 100 characters.
        </p>
      </label>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving..." : "Save and continue"}
      </button>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {retryHint ? <p className="text-xs text-slate-600">{retryHint}</p> : null}
    </form>
  );
}

