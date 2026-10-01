export type DatabaseHealth = "ok" | "timeout" | "error";

export async function checkDatabase(
	runQuery: () => Promise<unknown>,
	timeoutMs: number,
): Promise<DatabaseHealth> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), timeoutMs);
	});
	const query = Promise.resolve()
		.then(runQuery)
		.then(
			() => "ok" as const,
			(error) => {
				console.error("[health] database check failed", error);
				return "error" as const;
			},
		);
	try {
		return await Promise.race([query, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

export function healthResponse(
	database: DatabaseHealth,
	latencyMs: number,
): Response {
	const ok = database === "ok";
	return Response.json(
		{ ok, database, latencyMs },
		{ status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
	);
}
