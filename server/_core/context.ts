import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const isMockAllowed = process.env.NODE_ENV === "development" || process.env.BUNDLED_DESKTOP_APP === "true";
  const forceMock = process.env.BUNDLED_DESKTOP_APP === "true";

  if (!forceMock) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      console.warn("[Auth] Standard authentication failed, attempting mock fallback:", error);
    }
  }

  if (!user && isMockAllowed) {
    try {
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const existing = await db.select().from(users).where(eq(users.openId, "dev-mock-user-id")).limit(1);
        if (existing.length > 0) {
          user = existing[0];
        } else {
          const result = await db.insert(users).values({
             openId: "dev-mock-user-id",
             name: "Local Developer",
             email: "dev@localhost",
             loginMethod: "mock",
             role: "admin",
          });
          const created = await db.select().from(users).where(eq(users.id, result[0].insertId)).limit(1);
          user = created[0] || null;
        }
      } else {
        // Fallback to in-memory mock user if no database is connected
        user = {
          id: 1,
          openId: "dev-mock-user-id",
          name: "Local Developer",
          email: "dev@localhost",
          loginMethod: "mock",
          role: "admin",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        } as any;
      }
    } catch (dbError) {
      console.error("Failed to create mock user in DB:", dbError);
      // Fallback to in-memory mock user if DB query crashes
      user = {
        id: 1,
        openId: "dev-mock-user-id",
        name: "Local Developer",
        email: "dev@localhost",
        loginMethod: "mock",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as any;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
