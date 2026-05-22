import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";

import { env } from "./env";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

const LOCAL_DATABASE_HOST = "db.localtest.me";

function configureNeonForLocalProxy(databaseUrl: string): void {
	let databaseHost = "";
	try {
		databaseHost = new URL(databaseUrl).hostname;
	} catch {
		databaseHost = "";
	}

	if (databaseHost !== LOCAL_DATABASE_HOST) {
		return;
	}

	neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
	neonConfig.wsProxy = (host) => `${host}:4444/v2`;
	neonConfig.useSecureWebSocket = false;
	neonConfig.poolQueryViaFetch = true;
}

configureNeonForLocalProxy(env.DATABASE_URL);

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
