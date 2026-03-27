import { NextResponse } from "next/server";

export type ApiErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
  requestId: string;
};

export function createRequestId() {
  return crypto.randomUUID();
}

export function jsonError(args: {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number | null;
  requestId: string;
  headers?: HeadersInit;
}) {
  const body: ApiErrorBody = {
    code: args.code,
    message: args.message,
    retryable: args.retryable,
    retryAfterMs: args.retryAfterMs ?? null,
    requestId: args.requestId,
  };

  return NextResponse.json(body, {
    status: args.status,
    headers: {
      "x-request-id": args.requestId,
      ...(args.headers ?? {}),
    },
  });
}

export function jsonOk<T>(data: T, requestId: string, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "x-request-id": requestId },
  });
}

