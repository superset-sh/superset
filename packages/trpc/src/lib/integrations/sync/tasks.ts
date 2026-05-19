import { db } from "@superset/db/client";
import { integrationConnections, tasks } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { env } from "../../../env";
import { qstash } from "../../qstash";

const PROVIDER_ENDPOINTS: Record<string, string> = {
	linear: "/api/integrations/linear/jobs/sync-task",
};

export async function syncTask(taskId: string) {
	const task = await db.query.tasks.findFirst({
		where: eq(tasks.id, taskId),
		columns: { organizationId: true, externalProvider: true },
	});

	if (!task) {
		throw new Error("Task not found");
	}

	const connections = await db.query.integrationConnections.findMany({
		where: eq(integrationConnections.organizationId, task.organizationId),
		columns: { provider: true },
	});

	const qstashBaseUrl = env.NEXT_PUBLIC_API_URL;
	const providersToSync = connections.filter(
		(conn) => PROVIDER_ENDPOINTS[conn.provider],
	);

	if (!qstash) {
		if (providersToSync.length > 0) {
			console.warn(
				`[syncTask] QSTASH_TOKEN is not configured; skipped task sync for providers: ${providersToSync
					.map((conn) => conn.provider)
					.join(", ")}`,
			);
		}
		return connections.map((conn) => ({
			status: "fulfilled" as const,
			value: { provider: conn.provider, skipped: true },
		}));
	}
	const qstashClient = qstash;

	const results = await Promise.allSettled(
		connections.map(async (conn) => {
			const endpoint = PROVIDER_ENDPOINTS[conn.provider];
			if (!endpoint) {
				return { provider: conn.provider, skipped: true };
			}

			const syncUrl = `${qstashBaseUrl}${endpoint}`;

			await qstashClient.publishJSON({
				url: syncUrl,
				body: { taskId },
				retries: 3,
			});

			return { provider: conn.provider, queued: true };
		}),
	);

	const failures = results.filter((result) => result.status === "rejected");
	if (failures.length > 0) {
		console.error("[syncTask] failed to enqueue integration sync", failures);
	}

	return results;
}
