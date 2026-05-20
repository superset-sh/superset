import { Pool as NeonPool, neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNeonWs } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import pg from "pg";

import { env } from "./env";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

function isNeonDatabaseUrl(value: string): boolean {
	try {
		const hostname = new URL(value).hostname;
		return hostname.endsWith(".neon.tech") || hostname.endsWith(".neon.build");
	} catch {
		return false;
	}
}

const isNeon = isNeonDatabaseUrl(env.DATABASE_URL);

// Single canonical type — both adapters expose the same Drizzle PG surface at
// runtime, so we narrow callers to the Neon-HTTP shape (the production path)
// and cast the local-Postgres branch through it.
type Db = ReturnType<typeof drizzleNeonHttp<typeof schema>>;
type DbWs = ReturnType<typeof drizzleNeonWs<typeof schema>>;

const nodePgDb = isNeon
	? null
	: drizzleNodePg({
			client: new pg.Pool({ connectionString: env.DATABASE_URL }),
			schema,
			casing: "snake_case",
		});

export const db: Db = isNeon
	? drizzleNeonHttp({
			client: neon(env.DATABASE_URL),
			schema,
			casing: "snake_case",
		})
	: (nodePgDb as unknown as Db);

export const dbWs: DbWs = isNeon
	? drizzleNeonWs({
			client: new NeonPool({ connectionString: env.DATABASE_URL }),
			schema,
			casing: "snake_case",
		})
	: (nodePgDb as unknown as DbWs);
