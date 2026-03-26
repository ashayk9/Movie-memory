import OpenAI from "openai";

import { prisma } from "@/lib/db/prisma";

function normalizeMovieTitle(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export async function generateMovieFactBase({
  userId,
  movieTitle,
}: {
  userId: string;
  movieTitle: string;
}) {
  const normalizedMovieTitle = normalizeMovieTitle(movieTitle);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You write short fun movie facts. Return ONE sentence only. No quotes, no bullet points, no newlines. Keep it under 220 characters.",
      },
      {
        role: "user",
        content: `Movie title: ${normalizedMovieTitle}`,
      },
    ],
  });

  const factText = completion.choices[0]?.message?.content?.trim();
  if (!factText) {
    throw new Error("OpenAI returned an empty fact");
  }

  await prisma.movieFact.create({
    data: {
      userId,
      movieTitle: normalizedMovieTitle,
      factText,
    },
  });

  return factText;
}

