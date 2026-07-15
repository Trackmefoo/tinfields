import { PrismaClient } from "@prisma/client";

declare global {
  var __tinfieldsPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__tinfieldsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__tinfieldsPrisma = prisma;
}
