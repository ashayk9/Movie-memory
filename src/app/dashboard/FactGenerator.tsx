"use client";

import { useState } from "react";

export default function FactGenerator({
  movieTitle,
}: {
  movieTitle: string;
}) {
  const [factText, setFactText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/fact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieTitle }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to generate fact");
      }

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
          <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

