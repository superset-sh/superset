import { db } from "@superset/db/client";
import { sql } from "drizzle-orm";
import { checkDatabase, healthResponse } from "./checkDatabase";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

export async function GET() {
	const startedAt = Date.now();
	const database = await checkDatabase(
		() => db.execute(sql`select 1`),
		DB_TIMEOUT_MS,
	);
	return healthResponse(database, Date.now() - startedAt);
}
