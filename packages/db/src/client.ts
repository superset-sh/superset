import { neon, Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";

import { env } from "./env";
import { configureLocalProxy, isLocalProxy } from "./local-proxy";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

if (isLocalProxy(env.DATABASE_URL)) {
	configureLocalProxy();
}

const sql = neon(env.DATABASE_URL);

export const db = drizzle({
	client: sql,
	schema,
	casing: "snake_case",
});

const wsPool = new Pool({ connectionString: env.DATABASE_URL });

// Attach an error handler so a transient socket close (e.g. "Connection
// terminated unexpectedly") surfaces only the error message. Without a
// listener, node emits the error as an uncaught exception and the default
// logger serializes the whole NeonClient object — including
// `config.connectionString` with the embedded password — into logs.
wsPool.on("error", (error: Error) => {
	console.error(`[db] neon pool error: ${error.message}`);
});

export const dbWs = drizzleWs({
	client: wsPool,
	schema,
	casing: "snake_case",
});
