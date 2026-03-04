import { neon, Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";

import { env } from "./env";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

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
