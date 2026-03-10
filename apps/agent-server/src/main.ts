import "./env";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initOtelSdk, shutdownOtelSdk } from "@superbuilder/features-server/core/logger";
import { otelLogger } from "@superbuilder/features-server/core/logger/hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import {
  initPostHogServer,
  captureServerError,
  shutdownPostHogServer,
} from "@superbuilder/features-server/core/analytics";
import { db } from "./lib/db";
import { chatRoute } from "./routes/chat";
import { agentAppRouter, createContext } from "./trpc";

const app = new Hono();

// OpenTelemetry Logs SDK 초기화
if (process.env.POSTHOG_API_KEY) {
  initOtelSdk({
    serviceName: "agent-server",
    posthogApiKey: process.env.POSTHOG_API_KEY,
    posthogHost: process.env.POSTHOG_HOST,
  });
}

// PostHog 초기화
if (process.env.POSTHOG_API_KEY) {
  initPostHogServer({
    apiKey: process.env.POSTHOG_API_KEY,
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  });
}

// Global error handler
app.onError((err, c) => {
  const path = c.req.path;
  const method = c.req.method;

  captureServerError({
    path,
    method,
    statusCode: 500,
    errorMessage: err.message,
    errorCode: "INTERNAL_SERVER_ERROR",
    stack: err.stack,
  });

  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
        statusCode: 500,
        timestamp: new Date().toISOString(),
        path,
      },
    },
    500,
  );
});

// 미들웨어
app.use("*", otelLogger());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:3001",
    ],
  }),
);

// 헬스 체크 (DB 연결 확인 포함)
app.get("/health", async (c) => {
  try {
    await db.query.agentAgents.findFirst();
    return c.json({ status: "ok", service: "agent-server", db: "connected" });
  } catch {
    return c.json(
      { status: "error", service: "agent-server", db: "disconnected" },
      500,
    );
  }
});

// Chat API (SSE 스트리밍)
app.route("/api/chat", chatRoute);

// tRPC API (CRUD)
app.all("/trpc/*", (c) => {
  return fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: agentAppRouter,
    createContext: ({ req }) => createContext(req),
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await shutdownOtelSdk();
  await shutdownPostHogServer();
  process.exit(0);
});

// Vercel Serverless에서는 serve() 호출하지 않음
if (!process.env.VERCEL) {
  const port = Number(process.env.AGENT_SERVER_PORT ?? 3003);
  console.log(`Agent Server running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
