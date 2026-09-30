import { db } from "@superset/db/client";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

async function checkDatabase(): Promise<"ok" | "timeout" | "error"> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), DB_TIMEOUT_MS);
	});
	try {
		return await Promise.race([
			db.execute(sql`select 1`).then(() => "ok" as const),
			timeout,
		]);
	} catch (error) {
		console.error("[health] database check failed", error);
		return "error";
	} finally {
		clearTimeout(timer);
	}
}

export async function GET() {
	const startedAt = Date.now();
	const database = await checkDatabase();
	const ok = database === "ok";
	return Response.json(
		{ ok, database, latencyMs: Date.now() - startedAt },
		{ status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
	);
}
