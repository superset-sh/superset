import { neon, Pool, type PoolClient } from "@neondatabase/serverless";
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

const pool = new Pool({ connectionString: env.DATABASE_URL });

// node-postgres emits a dropped connection as an "error" event; with no listener it
// crashes the process. The pending query or transaction still rejects with it.
const logConnectionError = (error: unknown) =>
	console.warn("[db] pooled connection error", error);
pool.on("error", logConnectionError);
pool.on("connect", (client: PoolClient) =>
	client.on("error", logConnectionError),
);

export const dbWs = drizzleWs({
	client: pool,
	schema,
	casing: "snake_case",
});
