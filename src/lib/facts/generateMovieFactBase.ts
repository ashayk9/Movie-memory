import OpenAI from "openai";

import { prisma } from "@/lib/db/prisma";

function normalizeMovieTitle(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

type ProviderAttempt = {
  name: "openai" | "groq";
  client: OpenAI;
  model: string;
};

const CACHE_WINDOW_MS = 60_000;

export async function generateMovieFactBase({
  userId,
  movieTitle,
}: {
  userId: string;
  movieTitle: string;
}) {
  const normalizedMovieTitle = normalizeMovieTitle(movieTitle);

  // Variant A cache window: reuse the most recent fact for this exact user+movie key.
  const latestFact = await prisma.movieFact.findFirst({
    where: {
      userId,
      movieTitle: normalizedMovieTitle,
    },
    orderBy: { createdAt: "desc" },
    select: { factText: true, createdAt: true },
  });

  if (
    latestFact &&
    Date.now() - latestFact.createdAt.getTime() < CACHE_WINDOW_MS
  ) {
    return {
      factText: latestFact.factText,
      source: "cache" as const,
    };
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

  const lastMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`LLM call failed. Last error: ${lastMessage}`);

}

