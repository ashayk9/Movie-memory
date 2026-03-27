"use client";

import { useState } from "react";

import {
  formatErrorWithRequestId,
  formatRetryAfter,
  parseApiError,
} from "@/lib/api/clientError";

export default function FactGenerator({
  movieTitle,
  initialFactText,
}: {
  movieTitle: string;
  initialFactText?: string | null;
}) {
  const [factText, setFactText] = useState<string | null>(
    initialFactText ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryHint, setRetryHint] = useState<string | null>(null);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    setRetryHint(null);

    try {
      const res = await fetch("/api/fact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieTitle }),
      });

      if (!res.ok) {
        const apiErr = await parseApiError(res);
        const msg = apiErr?.message ?? "Failed to generate fact";
        setRetryHint(formatRetryAfter(apiErr?.retryAfterMs));
        throw new Error(formatErrorWithRequestId(msg, apiErr?.requestId));
      }

      const data = (await res.json().catch(() => ({}))) as {
        factText?: unknown;
      };
      setFactText(String(data.factText ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Fun fact</h2>
          <p className="mt-1 text-sm text-slate-600">
            Generated for <span className="font-medium">{movieTitle}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="btn-primary shrink-0"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      <div className="mt-4">
        {factText ? (
          <p className="card-muted p-5 text-slate-900">{factText}</p>
        ) : (
          <p className="text-sm text-slate-500">
            Click generate to get a fact.
          </p>
        )}

        {error ? (
          <div className="mt-3 space-y-1">
            <p className="text-sm font-medium text-red-600">{error}</p>
            {retryHint ? (
              <p className="text-xs text-slate-600">{retryHint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

