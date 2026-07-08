import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";

import { env } from "./env";
import { configureLocalProxy, isLocalProxy } from "./local-proxy";
import { createRetryingFetch } from "./retry-fetch";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

if (isLocalProxy(env.DATABASE_URL)) {
	configureLocalProxy();
}

// The neon-http driver issues one HTTP request per query with no built-in
// retry, so a transient connection-layer blip surfaces as user-facing 500s
// across every subsystem at once. Wrap the driver's fetch to retry transient
// failures with bounded backoff; deterministic SQL errors come back as HTTP
// 200 and are never retried. `fetchFunction` is a global neonConfig option in
// @neondatabase/serverless (not a per-`neon()` argument), so set it here.
neonConfig.fetchFunction = createRetryingFetch();

const sql = neon(env.DATABASE_URL);

export const db = drizzle({
	client: sql,
	schema,
	casing: "snake_case",
});

export const dbWs = drizzleWs({
	client: new Pool({ connectionString: env.DATABASE_URL }),
	schema,
	casing: "snake_case",
});
