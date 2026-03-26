import OpenAI from "openai";

import { prisma } from "@/lib/db/prisma";
import {
  GenerationInProgressError,
  LLMProviderError,
  MissingLLMCredentialsError,
} from "./errors";

export type FactResult = {
  factText: string;
  source: "cache" | "generated" | "fallback_cache";
};

const CACHE_WINDOW_MS = 60_000;
const LOCK_WAIT_MS = 250;
const LOCK_WAIT_ATTEMPTS = 5;
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS ?? "30000");

function normalizeMovieTitle(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLatestFact(userId: string, movieTitle: string) {
  return prisma.movieFact.findFirst({
    where: { userId, movieTitle },
    orderBy: { createdAt: "desc" },
    select: { factText: true, createdAt: true },
  });
}

function isFresh(createdAt: Date) {
  return Date.now() - createdAt.getTime() < CACHE_WINDOW_MS;
}

async function acquireOrWaitForLock(args: {
  userId: string;
  movieTitle: string; // already normalized
  lockKey: string;
  latestAtStartMs: number;
}) {
  const { userId, movieTitle, lockKey, latestAtStartMs } = args;

  try {
    await prisma.factGenerationLock.create({
      data: {
        userId,
        movieTitle,
        status: "IN_PROGRESS",
      },
    });
    console.info(`[facts] lock acquired key=${lockKey}`);
    return { owned: true as const };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== "P2002") throw e;

    console.info(`[facts] lock conflict key=${lockKey}`);

    const existingLock = await prisma.factGenerationLock.findUnique({
      where: {
        userId_movieTitle: {
          userId,
          movieTitle,
        },
      },
      select: { updatedAt: true },
    });

    if (!existingLock) {
      // Lock disappeared after unique conflict; retry once.
      await prisma.factGenerationLock.create({
        data: { userId, movieTitle, status: "IN_PROGRESS" },
      });
      console.info(`[facts] lock acquired after retry key=${lockKey}`);
      return { owned: true as const };
    }

    const lockAgeMs = Date.now() - existingLock.updatedAt.getTime();
    const isStale = lockAgeMs > LOCK_TTL_MS;
    if (isStale) {
      const reclaimed = await prisma.factGenerationLock.updateMany({
        where: {
          userId,
          movieTitle,
          updatedAt: existingLock.updatedAt,
        },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      });
      if (reclaimed.count === 1) {
        console.info(`[facts] stale lock reclaimed key=${lockKey}`);
        return { owned: true as const };
      }
    }

    console.info(`[facts] waiting for active generation key=${lockKey}`);
    for (let i = 0; i < LOCK_WAIT_ATTEMPTS; i += 1) {
      await sleep(LOCK_WAIT_MS * (i + 1));
      const recentFact = await getLatestFact(userId, movieTitle);
      const recentMs = recentFact?.createdAt.getTime() ?? 0;
      if (recentFact && recentMs > latestAtStartMs) {
        console.info(`[facts] served fresh fact after wait key=${lockKey}`);
        return { owned: false as const, factText: recentFact.factText };
      }
    }

    throw new GenerationInProgressError();
  }
}

function buildProviderAttempts() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const attempts: Array<{
    name: "openai" | "groq";
    client: OpenAI;
    model: string;
  }> = [];

  if (openaiKey) {
    attempts.push({
      name: "openai",
      client: new OpenAI({ apiKey: openaiKey }),
      model: "gpt-4o-mini",
    });
  }

  if (groqKey) {
    attempts.push({
      name: "groq",
      client: new OpenAI({
        apiKey: groqKey,
        baseURL: "https://api.groq.com/openai/v1",
      }),
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    });
  }

  if (attempts.length === 0) {
    throw new MissingLLMCredentialsError();
  }

  return attempts;
}

async function callLLM(movieTitle: string) {
  const attempts = buildProviderAttempts();

  const messages = [
    {
      role: "system" as const,
      content:
        "You write short fun movie facts. Return ONE sentence only. No quotes, no bullet points, no newlines. Keep it under 220 characters.",
    },
    {
      role: "user" as const,
      content: `Movie title: ${movieTitle}`,
    },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const completion = await attempt.client.chat.completions.create({
        model: attempt.model,
        temperature: 0.7,
        messages,
      });

      const factText = completion.choices[0]?.message?.content?.trim();
      if (!factText) throw new Error(`${attempt.name} returned an empty fact`);
      return factText;
    } catch (e) {
      lastError = e;
    }
  }

  const lastMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new LLMProviderError(`LLM call failed. Last error: ${lastMessage}`, lastError);
}

async function releaseLock(userId: string, movieTitle: string, lockKey: string) {
  await prisma.factGenerationLock.deleteMany({
    where: { userId, movieTitle },
  });
  console.info(`[facts] lock released key=${lockKey}`);
}

export async function getFactForUserMovie(args: {
  userId: string;
  movieTitle: string;
}): Promise<FactResult> {
  const normalizedMovieTitle = normalizeMovieTitle(args.movieTitle);
  const lockKey = `${args.userId}:${normalizedMovieTitle}`;

  const latestFact = await getLatestFact(args.userId, normalizedMovieTitle);
  if (latestFact && isFresh(latestFact.createdAt)) {
    return { factText: latestFact.factText, source: "cache" };
  }

  const latestAtStartMs = latestFact?.createdAt.getTime() ?? 0;

  const lock = await acquireOrWaitForLock({
    userId: args.userId,
    movieTitle: normalizedMovieTitle,
    lockKey,
    latestAtStartMs,
  });

  if (!lock.owned) {
    return { factText: lock.factText, source: "cache" };
  }

  try {
    // Another request may have completed generation while we acquired the lock.
    const latestAfterLock = await getLatestFact(args.userId, normalizedMovieTitle);
    if (latestAfterLock && isFresh(latestAfterLock.createdAt)) {
      return { factText: latestAfterLock.factText, source: "cache" };
    }

    const factText = await callLLM(normalizedMovieTitle);
    await prisma.movieFact.create({
      data: {
        userId: args.userId,
        movieTitle: normalizedMovieTitle,
        factText,
      },
    });

    return { factText, source: "generated" };
  } catch (e) {
    const fallbackFact = await getLatestFact(args.userId, normalizedMovieTitle);
    if (fallbackFact) {
      return { factText: fallbackFact.factText, source: "fallback_cache" };
    }
    throw e;
  } finally {
    await releaseLock(args.userId, normalizedMovieTitle, lockKey);
  }
}

