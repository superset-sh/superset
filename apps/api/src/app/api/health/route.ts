import { db } from "@superset/db/client";
import { organizations, users } from "@superset/db/schema";
import { checkDatabase, healthResponse } from "./checkDatabase";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

function readAuthTables() {
	return Promise.all([
		db.select({ id: users.id }).from(users).limit(1),
		db.select({ id: organizations.id }).from(organizations).limit(1),
	]);
}

export async function GET() {
	const startedAt = Date.now();
	const database = await checkDatabase(readAuthTables, DB_TIMEOUT_MS);
	return healthResponse(database, Date.now() - startedAt);
}
