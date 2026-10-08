import type { AgentIdentity } from "@superset/shared/agent-identity";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../db/schema";
import type { AgentLifecycleEventType } from "../../../events";
import type { HostServiceContext } from "../../../types";
import { touchLocalWorkspaceActivity } from "../../../workspaces/local-workspace-store";
import { continueWorkspaceNaming } from "../workspace-creation/utils/workspace-naming-job";

// Tasks already nudged to "started" this process. `Start` fires on every
// agent turn and tool use, so gate the cloud call to once per task per
// process — `task.start` is idempotent and forward-only server-side, so a
// duplicate after a restart is harmless.
const startedTaskIds = new Set<string>();

function markLinkedTaskStarted(
	ctx: HostServiceContext,
	workspaceId: string,
): void {
	const workspace = ctx.db.query.workspaces
		.findFirst({
			where: eq(workspaces.id, workspaceId),
			columns: { taskId: true },
		})
		.sync();
	const taskId = workspace?.taskId;
	if (!taskId || startedTaskIds.has(taskId)) return;
	startedTaskIds.add(taskId);
	void ctx.api.task.start.mutate({ id: taskId }).catch((err) => {
		// Let a later Start event retry — calls are event-driven (one per
		// agent turn/tool use at most), so a cloud outage can't tight-loop.
		startedTaskIds.delete(taskId);
		console.warn(
			`[notifications.hook] failed to mark task ${taskId} as started:`,
			err,
		);
	});
}

export function fanOutAgentLifecycle(
	ctx: HostServiceContext,
	event: {
		workspaceId: string;
		eventType: AgentLifecycleEventType;
		terminalId: string;
		agent?: AgentIdentity;
		preview?: string;
		occurredAt: number;
	},
): void {
	const { workspaceId, eventType, preview, occurredAt } = event;
	ctx.eventBus.broadcastAgentLifecycle(event);

	// Every lifecycle event is activity for the sidebar's "Last active"
	// ranking. Best-effort: a failed write must not fail the caller, which
	// also drives the chime and the status dots.
	try {
		touchLocalWorkspaceActivity(ctx, workspaceId, occurredAt);
	} catch (err) {
		console.warn(
			`[agent-lifecycle] failed to record activity for workspace ${workspaceId}:`,
			err,
		);
	}

	try {
		continueWorkspaceNaming(ctx, workspaceId, {
			eventType,
			agentReply: preview,
		});
	} catch (err) {
		console.warn(
			`[agent-lifecycle] failed to schedule naming for workspace ${workspaceId}:`,
			err,
		);
	}

	if (eventType !== "Start") return;
	try {
		markLinkedTaskStarted(ctx, workspaceId);
	} catch (err) {
		console.warn(
			`[agent-lifecycle] failed to mark the task for workspace ${workspaceId} as started:`,
			err,
		);
	}
}
