import { db } from "@superset/db/client";
import { integrationConnections, tasks } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { env } from "../../../env";

const qstash = new Client({ token: env.QSTASH_TOKEN });

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

	const results = await Promise.allSettled(
		connections.map(async (conn) => {
			const endpoint = PROVIDER_ENDPOINTS[conn.provider];
			if (!endpoint) {
				return { provider: conn.provider, skipped: true };
			}

			const syncUrl = `${qstashBaseUrl}${endpoint}`;

			// In development, call the sync endpoint directly (QStash can't reach localhost)
			if (env.NODE_ENV === "development") {
				try {
					await fetch(syncUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ taskId }),
					});
				} catch (error) {
					console.error(
						`[sync/tasks] Dev sync failed for ${conn.provider}:`,
						error,
					);
				}
			} else {
				await qstash.publishJSON({
					url: syncUrl,
					body: { taskId },
					retries: 3,
				});
			}

			return { provider: conn.provider, queued: true };
		}),
	);

	return results;
}
