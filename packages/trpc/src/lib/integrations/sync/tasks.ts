import { db } from "@superset/db/client";
import { connections, tasks } from "@superset/db/schema";
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

	const connected = await db
		.selectDistinct({ connector: connections.connector })
		.from(connections)
		.where(eq(connections.organizationId, task.organizationId));

	const qstashBaseUrl = env.NEXT_PUBLIC_API_URL;

	const results = await Promise.allSettled(
		connected.map(async (conn) => {
			const endpoint = PROVIDER_ENDPOINTS[conn.connector];
			if (!endpoint) {
				return { provider: conn.connector, skipped: true };
			}

			const syncUrl = `${qstashBaseUrl}${endpoint}`;

			await qstash.publishJSON({
				url: syncUrl,
				body: { taskId },
				retries: 3,
			});

			return { provider: conn.connector, queued: true };
		}),
	);

	return results;
}
