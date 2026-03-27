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
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            <span className="mr-1" aria-hidden="true">
              ✨
            </span>
            Fun fact
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Generated for <span className="font-medium">{movieTitle}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Facts are cached for 60 seconds. Clicking Generate after 60 seconds
            creates a new fact.
          </p>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="btn-primary w-full shrink-0 gap-2 sm:w-auto"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="spinner" aria-hidden="true" />
              Generating...
            </span>
          ) : (
            <>
              <span aria-hidden="true">✨</span>
              Generate
            </>
          )}
        </button>
      </div>

      <div className="mt-4">
        {factText ? (
          <p className="card-muted p-5 text-slate-900">{factText}</p>
        ) : (
          <div className="alert-info">
            No fact yet. Click <span className="font-medium">Generate</span> to
            create one.
          </div>
        )}
        {loading && !factText ? (
          <div className="skeleton mt-3 p-5">
            <div className="h-4 w-1/3 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-full rounded bg-slate-200" />
            <div className="mt-2 h-4 w-5/6 rounded bg-slate-200" />
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 space-y-1">
            <p className="alert-error" role="alert">
              {error}
            </p>
            {retryHint ? (
              <p className="alert-info">{retryHint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

