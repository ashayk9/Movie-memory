export type ApiErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
  requestId: string;
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.message === "string" &&
    typeof v.retryable === "boolean" &&
    (typeof v.retryAfterMs === "number" || v.retryAfterMs === null) &&
    typeof v.requestId === "string"
  );
}

export async function parseApiError(res: Response): Promise<ApiErrorBody | null> {
  const json = await res.json().catch(() => null);
  return isApiErrorBody(json) ? json : null;
}

export function formatRetryAfter(retryAfterMs: number | null | undefined) {
  if (retryAfterMs == null) return null;
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Retry in ${seconds}s`;
}

export function formatErrorWithRequestId(message: string, requestId?: string) {
  return requestId ? `${message} (requestId: ${requestId})` : message;
}

