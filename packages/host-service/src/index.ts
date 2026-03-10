import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/router";

export type { AppRouter } from "./trpc/router";

const app = new Hono();

app.use("*", cors());
app.use("/trpc/*", trpcServer({ router: appRouter }));

export default app;
