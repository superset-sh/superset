import type { AgentIdentity } from "@superset/shared/agent-identity";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions, workspaces } from "../../../db/schema";
import { mapEventType } from "../../../events";
import type { HostServiceContext } from "../../../types";
import { touchLocalWorkspaceActivity } from "../../../workspaces/local-workspace-store";
import { publicProcedure, router } from "../../index";

// Hook scripts emit "" for unset env vars; we coerce to undefined so the
// AgentIdentity broadcast carries only meaningful fields.
const agentIdentityInput = z
	.object({
		agentId: z.string().optional(),
		sessionId: z.string().optional(),
		definitionId: z.string().optional(),
	})
	.optional();

const hookInput = z.object({
	terminalId: z.string().optional(),
	eventType: z.string().optional(),
	agent: agentIdentityInput,
});

function trimOrUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeAgentIdentity(
	agent: z.infer<typeof agentIdentityInput>,
): AgentIdentity | undefined {
	const agentId = trimOrUndefined(agent?.agentId);
	if (!agentId) return undefined;
	const sessionId = trimOrUndefined(agent?.sessionId);
	const definitionId = trimOrUndefined(agent?.definitionId);
	return {
		agentId: agentId as AgentIdentity["agentId"],
		...(sessionId ? { sessionId } : {}),
		...(definitionId
			? { definitionId: definitionId as AgentIdentity["definitionId"] }
			: {}),
	};
}

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

export const notificationsRouter = router({
	/**
	 * Agent lifecycle hook. The shell hook POSTs here; we normalize, resolve
	 * the terminal's workspace, and fan out over the WS event bus.
	 *
	 * Intentionally unauthenticated: a caller can only trigger a chime, a
	 * sidebar indicator, and the idempotent forward-only "linked task →
	 * In Progress" nudge for a real workspace. Reusing the host-service PSK
	 * would leak it into every agent shell's env for zero practical gain.
	 */
	hook: publicProcedure.input(hookInput).mutation(async ({ ctx, input }) => {
		const eventType = mapEventType(input.eventType);
		if (!eventType) {
			return { success: true, ignored: true as const };
		}

		if (!input.terminalId) {
			return { success: true, ignored: true as const };
		}

		const terminalSession = ctx.db.query.terminalSessions
			.findFirst({
				where: eq(terminalSessions.id, input.terminalId),
				columns: { originWorkspaceId: true },
			})
			.sync();
		if (!terminalSession?.originWorkspaceId) {
			return { success: true, ignored: true as const };
		}

		const agent = normalizeAgentIdentity(input.agent);
		const occurredAt = Date.now();

		ctx.eventBus.broadcastAgentLifecycle({
			workspaceId: terminalSession.originWorkspaceId,
			eventType,
			terminalId: input.terminalId,
			...(agent ? { agent } : {}),
			occurredAt,
		});

		ctx.terminalAgentStore.recordEvent({
			terminalId: input.terminalId,
			workspaceId: terminalSession.originWorkspaceId,
			eventType,
			...(agent?.agentId ? { agentId: agent.agentId } : {}),
			...(agent?.sessionId ? { agentSessionId: agent.sessionId } : {}),
			...(agent?.definitionId ? { definitionId: agent.definitionId } : {}),
			occurredAt,
		});

		// Every lifecycle event is activity for the sidebar's "Last active"
		// ranking. Best-effort: a failed write must not fail the hook, which
		// also drives the chime and the status dots.
		try {
			touchLocalWorkspaceActivity(
				ctx,
				terminalSession.originWorkspaceId,
				occurredAt,
			);
		} catch (err) {
			console.warn(
				`[notifications.hook] failed to record activity for workspace ${terminalSession.originWorkspaceId}:`,
				err,
			);
		}

		// An agent began working in this workspace — nudge the linked task
		// to In Progress.
		if (eventType === "Start") {
			markLinkedTaskStarted(ctx, terminalSession.originWorkspaceId);
		}

		return { success: true, ignored: false as const };
	}),
});
