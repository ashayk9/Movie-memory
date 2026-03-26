import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prevent creating a new PrismaClient on every hot reload in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL for Prisma client");
    }

    return new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      // Optional: keep logs quiet by default; enable in debugging.
      // In development, Prisma "error" logs include expected unique-constraint conflicts
      // (used for our lock mechanism). We handle those in code, so keep console cleaner.
      log: process.env.NODE_ENV === "development" ? ["warn"] : ["error"],
    });
  })();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

