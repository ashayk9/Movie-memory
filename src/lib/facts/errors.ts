export type ApiErrorCode =
  | "GENERATION_IN_PROGRESS"
  | "MISSING_LLM_CREDENTIALS"
  | "LLM_FAILED"
  | "RATE_LIMITED";

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    opts: {
      code: ApiErrorCode;
      status: number;
      retryable: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    }
  ) {
    super(message, { cause: opts.cause });
    this.name = this.constructor.name;
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export class GenerationInProgressError extends AppError {
  constructor() {
    super("Fact generation in progress.", {
      code: "GENERATION_IN_PROGRESS",
      status: 409,
      retryable: true,
      retryAfterMs: 1000,
    });
  }
}

export class MissingLLMCredentialsError extends AppError {
  constructor() {
    super("Missing LLM credentials.", {
      code: "MISSING_LLM_CREDENTIALS",
      status: 503,
      retryable: false,
    });
  }
}

export class LLMProviderError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: "LLM_FAILED",
      status: 502,
      retryable: true,
      cause,
    });
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterMs: number) {
    super("Too many fact requests. Please try again shortly.", {
      code: "RATE_LIMITED",
      status: 429,
      retryable: true,
      retryAfterMs,
    });
  }
}

