import OpenAI from "openai";

import { prisma } from "@/lib/db/prisma";

function normalizeMovieTitle(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ProviderAttempt = {
  name: "openai" | "groq";
  client: OpenAI;
  model: string;
};

const CACHE_WINDOW_MS = 60_000;
const LOCK_WAIT_MS = 250;
const LOCK_WAIT_ATTEMPTS = 5;
const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS ?? "30000");

type FactResult = {
  factText: string;
  source: "cache" | "generated" | "fallback_cache";
};

async function getLatestFact(userId: string, movieTitle: string) {
  return prisma.movieFact.findFirst({
    where: { userId, movieTitle },
    orderBy: { createdAt: "desc" },
    select: { factText: true, createdAt: true },
  });
}

export async function generateMovieFactBase({
  userId,
  movieTitle,
}: {
  userId: string;
  movieTitle: string;
}): Promise<FactResult> {
  const normalizedMovieTitle = normalizeMovieTitle(movieTitle);
  const lockKey = `${userId}:${normalizedMovieTitle}`;
  const requestStartedAt = new Date();

  // Variant A cache window: reuse the most recent fact for this exact user+movie key.
  const latestFact = await getLatestFact(userId, normalizedMovieTitle);

  if (
    latestFact &&
    Date.now() - latestFact.createdAt.getTime() < CACHE_WINDOW_MS
  ) {
    return {
      factText: latestFact.factText,
      source: "cache" as const,
    };
  }

  let lockOwned = false;
  try {
    await prisma.factGenerationLock.create({
      data: {
        userId,
        movieTitle: normalizedMovieTitle,
        status: "IN_PROGRESS",
      },
    });
    lockOwned = true;
    console.info(`[facts] lock acquired key=${lockKey}`);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code !== "P2002") {
      throw e;
    }
    console.info(`[facts] lock conflict key=${lockKey}`);

    const existingLock = await prisma.factGenerationLock.findUnique({
      where: {
        userId_movieTitle: {
          userId,
          movieTitle: normalizedMovieTitle,
        },
      },
      select: { updatedAt: true },
    });

    if (!existingLock) {
      // Lock disappeared after unique conflict; retry once quickly.
      await prisma.factGenerationLock.create({
        data: {
          userId,
          movieTitle: normalizedMovieTitle,
          status: "IN_PROGRESS",
        },
      });
      lockOwned = true;
    } else {
      const lockAgeMs = Date.now() - existingLock.updatedAt.getTime();
      const isStale = lockAgeMs > LOCK_TTL_MS;

      if (isStale) {
        const reclaimed = await prisma.factGenerationLock.updateMany({
          where: {
            userId,
            movieTitle: normalizedMovieTitle,
            updatedAt: existingLock.updatedAt,
          },
          data: {
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });
        lockOwned = reclaimed.count === 1;
        if (lockOwned) {
          console.info(`[facts] stale lock reclaimed key=${lockKey}`);
        }
      }
    }

    if (!lockOwned) {
      console.info(`[facts] waiting for active generation key=${lockKey}`);
      const latestAtRequestStartMs = latestFact?.createdAt.getTime() ?? 0;

      for (let i = 0; i < LOCK_WAIT_ATTEMPTS; i += 1) {
        await sleep(LOCK_WAIT_MS * (i + 1));
        const recentFact = await getLatestFact(userId, normalizedMovieTitle);
        const recentMs = recentFact?.createdAt.getTime() ?? 0;

        // Only return if a newer fact than request-start baseline is available.
        if (recentFact && recentMs > latestAtRequestStartMs) {
          console.info(`[facts] served fresh fact after wait key=${lockKey}`);
          return {
            factText: recentFact.factText,
            source: "cache",
          };
        }
      }

      throw new Error("FACT_GENERATION_IN_PROGRESS");
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const attempts: ProviderAttempt[] = [];

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
        // Groq exposes an OpenAI-compatible API.
        baseURL: "https://api.groq.com/openai/v1",
      }),
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    });
  }

  if (attempts.length === 0) {
    throw new Error(
      "Missing LLM credentials. Set OPENAI_API_KEY and/or GROQ_API_KEY."
    );
  }

  const messages = [
    {
      role: "system" as const,
      content:
        "You write short fun movie facts. Return ONE sentence only. No quotes, no bullet points, no newlines. Keep it under 220 characters.",
    },
    {
      role: "user" as const,
      content: `Movie title: ${normalizedMovieTitle}`,
    },
  ];

  try {
    // Another request may have completed generation while we were acquiring lock.
    const latestAfterLock = await getLatestFact(userId, normalizedMovieTitle);
    if (
      latestAfterLock &&
      Date.now() - latestAfterLock.createdAt.getTime() < CACHE_WINDOW_MS
    ) {
      return {
        factText: latestAfterLock.factText,
        source: "cache",
      };
    }

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        const completion = await attempt.client.chat.completions.create({
          model: attempt.model,
          temperature: 0.7,
          messages,
        });

        const factText = completion.choices[0]?.message?.content?.trim();
        if (!factText) {
          throw new Error(`${attempt.name} returned an empty fact`);
        }

        await prisma.movieFact.create({
          data: {
            userId,
            movieTitle: normalizedMovieTitle,
            factText,
          },
        });

        return {
          factText,
          source: "generated" as const,
        };
      } catch (e) {
        lastError = e;
      }
    }

    // Failure fallback: return most recent cached fact if available.
    const fallbackFact = await getLatestFact(userId, normalizedMovieTitle);
    if (fallbackFact) {
      return {
        factText: fallbackFact.factText,
        source: "fallback_cache",
      };
    }

    const lastMessage =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`LLM call failed. Last error: ${lastMessage}`);
  } finally {
    if (lockOwned) {
      await prisma.factGenerationLock.deleteMany({
        where: { userId, movieTitle: normalizedMovieTitle },
      });
      console.info(`[facts] lock released key=${lockKey}`);
    }
  }
}

