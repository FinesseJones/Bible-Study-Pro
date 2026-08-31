/**
 * Netlify Serverless Function Entry Point — Bible Study Pro
 *
 * Wraps the existing Express app with serverless-http so it can run
 * as a Netlify Lambda function. The local .app packaging and dev server
 * continue to use server/_core/index.ts directly — this file is ONLY
 * used when deployed to Netlify Functions.
 *
 * LLC Architecture Rules compliance:
 *   - Backends must use Express wrapped in serverless-http for Netlify Functions.
 */
import serverless from "serverless-http";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// Lazy-load the app router and context to keep cold starts fast
async function createApp() {
  const { appRouter } = await import("../../server/routers.js");
  const { createContext } = await import("../../server/_core/context.js");
  const { registerOAuthRoutes } = await import("../../server/_core/oauth.js");

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}

// Cache the serverless handler across warm invocations
let cachedHandler: ReturnType<typeof serverless> | null = null;

export const handler = async (event: any, context: any) => {
  if (!cachedHandler) {
    const app = await createApp();
    cachedHandler = serverless(app);
  }
  return cachedHandler(event, context);
};
