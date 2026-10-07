import { neon, Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "./env";
import { configureLocalProxy, isLocalProxy } from "./local-proxy";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

const drizzleOptions = { schema, casing: "snake_case" } as const;
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db;
let dbWs: Db;

if (env.SELF_HOST_DB === "1") {
	const pg = drizzlePg({
		client: postgres(env.DATABASE_URL_UNPOOLED),
		...drizzleOptions,
	});
	db = pg;
	dbWs = pg;
} else {
	if (isLocalProxy(env.DATABASE_URL)) {
		configureLocalProxy();
	}

	db = drizzle({ client: neon(env.DATABASE_URL), ...drizzleOptions });
	dbWs = drizzleWs({
		client: new Pool({ connectionString: env.DATABASE_URL }),
		...drizzleOptions,
	});
}

export { db, dbWs };
