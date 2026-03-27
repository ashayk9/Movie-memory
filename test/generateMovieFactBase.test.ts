import { beforeEach, describe, expect, it, vi } from "vitest";

const movieFactFindFirst = vi.fn();
const movieFactCreate = vi.fn();
const movieFactFindMany = vi.fn();
const movieFactDeleteMany = vi.fn();
const lockCreate = vi.fn();
const lockFindUnique = vi.fn();
const lockUpdateMany = vi.fn();
const lockDeleteMany = vi.fn();
const completionCreate = vi.fn();
const openAIConstructor = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    movieFact: {
      findFirst: movieFactFindFirst,
      create: movieFactCreate,
      findMany: movieFactFindMany,
      deleteMany: movieFactDeleteMany,
    },
    factGenerationLock: {
      create: lockCreate,
      findUnique: lockFindUnique,
      updateMany: lockUpdateMany,
      deleteMany: lockDeleteMany,
    },
  },
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = {
      completions: {
        create: completionCreate,
      },
    };

    constructor(opts: unknown) {
      openAIConstructor(opts);
    }
  },
}));

describe("getFactForUserMovie Variant A behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.GROQ_API_KEY;
    movieFactFindMany.mockResolvedValue([]);
    movieFactDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("returns cached fact within 60s and skips LLM call", async () => {
    movieFactFindFirst.mockResolvedValueOnce({
      factText: "cached fact",
      createdAt: new Date(Date.now() - 10_000),
    });

    const { getFactForUserMovie } = await import(
      "@/lib/facts/getFactForUserMovie"
    );
    const result = await getFactForUserMovie({
      userId: "user-1",
      movieTitle: "  Avengers   ",
    });

    expect(result).toEqual(
      expect.objectContaining({
        factText: "cached fact",
        source: "cache",
      }),
    );
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(openAIConstructor).not.toHaveBeenCalled();
    expect(lockCreate).not.toHaveBeenCalled();
  });

  it("generates and stores a new fact when cache is older than 60s", async () => {
    movieFactFindFirst
      .mockResolvedValueOnce({
        factText: "old fact",
        createdAt: new Date(Date.now() - 61_000),
      })
      .mockResolvedValueOnce({
        factText: "old fact",
        createdAt: new Date(Date.now() - 61_000),
      });

    lockCreate.mockResolvedValueOnce({ id: "lock-1" });
    completionCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "new generated fact" } }],
    });
    movieFactCreate.mockResolvedValueOnce({});
    lockDeleteMany.mockResolvedValueOnce({ count: 1 });

    const { getFactForUserMovie } = await import(
      "@/lib/facts/getFactForUserMovie"
    );
    const result = await getFactForUserMovie({
      userId: "user-1",
      movieTitle: "Avengers",
    });

    expect(result).toEqual(
      expect.objectContaining({
        factText: "new generated fact",
        source: "generated",
      }),
    );
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(completionCreate).toHaveBeenCalledTimes(1);
    expect(movieFactCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        movieTitle: "Avengers",
        factText: "new generated fact",
      },
    });
    expect(lockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", movieTitle: "Avengers" },
    });
  });

  it("returns in-progress error when lock is active and no fresh fact appears", async () => {
    vi.useFakeTimers();

    movieFactFindFirst.mockResolvedValue(null);
    lockCreate.mockRejectedValueOnce({ code: "P2002" });
    lockFindUnique.mockResolvedValueOnce({
      updatedAt: new Date(),
    });

    const { getFactForUserMovie } = await import(
      "@/lib/facts/getFactForUserMovie"
    );

    const promise = getFactForUserMovie({
      userId: "user-1",
      movieTitle: "Avengers",
    });
    const pendingExpectation = expect(promise).rejects.toMatchObject({
      code: "GENERATION_IN_PROGRESS",
      status: 409,
    });

    await vi.runAllTimersAsync();
    await pendingExpectation;

    expect(completionCreate).not.toHaveBeenCalled();
    expect(lockDeleteMany).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("always scopes cache lookup by userId + normalized movieTitle", async () => {
    movieFactFindFirst.mockResolvedValueOnce({
      factText: "cached fact",
      createdAt: new Date(Date.now() - 5_000),
    });

    const { getFactForUserMovie } = await import(
      "@/lib/facts/getFactForUserMovie"
    );
    await getFactForUserMovie({
      userId: "user-A",
      movieTitle: "  Avengers   ",
    });

    expect(movieFactFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-A",
        movieTitle: "Avengers",
      },
      orderBy: { createdAt: "desc" },
      select: { factText: true, createdAt: true },
    });
  });

  it("returns fallback_cache when LLM fails and cached fact exists", async () => {
    movieFactFindFirst
      .mockResolvedValueOnce({
        factText: "old cached fact",
        createdAt: new Date(Date.now() - 61_000),
      })
      .mockResolvedValueOnce({
        factText: "old cached fact",
        createdAt: new Date(Date.now() - 61_000),
      })
      .mockResolvedValueOnce({
        factText: "old cached fact",
        createdAt: new Date(Date.now() - 61_000),
      });

    lockCreate.mockResolvedValueOnce({ id: "lock-1" });
    completionCreate.mockRejectedValueOnce(new Error("provider down"));
    lockDeleteMany.mockResolvedValueOnce({ count: 1 });

    const { getFactForUserMovie } = await import(
      "@/lib/facts/getFactForUserMovie"
    );
    const result = await getFactForUserMovie({
      userId: "user-1",
      movieTitle: "Avengers",
    });

    expect(result).toEqual(
      expect.objectContaining({
        factText: "old cached fact",
        source: "fallback_cache",
      }),
    );
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(completionCreate).toHaveBeenCalledTimes(1);
    expect(movieFactCreate).not.toHaveBeenCalled();
    expect(lockDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("handles two concurrent calls with one generated and one cache follower", async () => {
    vi.useFakeTimers();

    const staleFact = {
      factText: "stale fact",
      createdAt: new Date(Date.now() - 70_000),
    };
    let latest = staleFact;

    movieFactFindFirst.mockImplementation(async () => latest);
    lockCreate
      .mockResolvedValueOnce({ id: "lock-1" })
      .mockRejectedValueOnce({ code: "P2002" });
    lockFindUnique.mockResolvedValue({ updatedAt: new Date() });
    completionCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "freshly generated fact" } }],
    });
    movieFactCreate.mockImplementation(async (args: any) => {
      latest = {
        factText: args.data.factText,
        createdAt: new Date(),
      };
      return {};
    });
    lockDeleteMany.mockResolvedValue({ count: 1 });

    const { getFactForUserMovie } = await import(
      "@/lib/facts/getFactForUserMovie"
    );

    const p1 = getFactForUserMovie({
      userId: "user-1",
      movieTitle: "Avengers",
    });
    const p2 = getFactForUserMovie({
      userId: "user-1",
      movieTitle: "Avengers",
    });

    const both = Promise.all([p1, p2]);
    await vi.runAllTimersAsync();
    const [r1, r2] = await both;

    expect(completionCreate).toHaveBeenCalledTimes(1);
    expect(movieFactCreate).toHaveBeenCalledTimes(1);
    expect([r1.source, r2.source].sort()).toEqual(["cache", "generated"]);

    vi.useRealTimers();
  });
});

