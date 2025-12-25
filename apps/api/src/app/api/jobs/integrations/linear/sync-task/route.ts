import { db } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import {
	getDefaultTeamId,
	syncTaskToLinear,
} from "@superset/trpc/integrations/linear";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { env } from "@/env";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

interface SyncTaskPayload {
	taskId: string;
	teamId?: string;
}

/**
 * QStash job handler for syncing tasks to Linear
 *
 * POST /api/jobs/integrations/linear/sync-task
 */
export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	if (!signature) {
		console.error("[job/linear/sync-task] Missing signature");
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	// Verify QStash signature
	const isValid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/jobs/integrations/linear/sync-task`,
	});

	if (!isValid) {
		console.error("[job/linear/sync-task] Invalid signature");
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let payload: SyncTaskPayload;
	try {
		payload = JSON.parse(body);
	} catch {
		console.error("[job/linear/sync-task] Invalid JSON payload");
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { taskId, teamId } = payload;

	if (!taskId) {
		console.error("[job/linear/sync-task] Missing taskId");
		return Response.json({ error: "Missing taskId" }, { status: 400 });
	}

	// Fetch the task
	const task = await db.query.tasks.findFirst({
		where: eq(tasks.id, taskId),
	});

	if (!task) {
		console.error("[job/linear/sync-task] Task not found:", taskId);
		// Return 200 to prevent retries for non-existent tasks
		return Response.json({ error: "Task not found", skipped: true });
	}

	// Get team ID - use provided or fetch default
	const resolvedTeamId =
		teamId ?? (await getDefaultTeamId(task.organizationId));
	if (!resolvedTeamId) {
		console.error(
			"[job/linear/sync-task] No team ID configured for org:",
			task.organizationId,
		);
		return Response.json({ error: "No team configured", skipped: true });
	}

	// Sync to Linear
	const result = await syncTaskToLinear(task, resolvedTeamId);

	if (!result.success) {
		console.error("[job/linear/sync-task] Sync failed:", result.error);
		// Return 500 to trigger QStash retry
		return Response.json({ error: result.error }, { status: 500 });
	}

	console.log(
		"[job/linear/sync-task] Synced task:",
		task.slug,
		"->",
		result.externalKey,
	);

	return Response.json({
		success: true,
		externalId: result.externalId,
		externalKey: result.externalKey,
	});
}
