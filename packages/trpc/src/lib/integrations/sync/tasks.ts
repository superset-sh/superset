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

	const results = await Promise.allSettled(
		connections.map(async (conn) => {
			const endpoint = PROVIDER_ENDPOINTS[conn.provider];
			if (!endpoint) {
				return { provider: conn.provider, skipped: true };
			}

			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}${endpoint}`,
				body: { taskId },
				retries: 3,
			});

			return { provider: conn.provider, queued: true };
		}),
	);

	return results;
}
