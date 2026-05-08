import type { AgentIdentity } from "@superset/shared/agent-identity";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions } from "../../../db/schema";
import { mapEventType } from "../../../events";
import { publicProcedure, router } from "../../index";

/**
 * v2 terminal hook payload. The shell hook sends only stable runtime identity;
 * host-service derives workspace identity from its terminal session table.
 *
 * `agent` carries the wrapper-stamped identity (`agentId` plus an optional
 * agent-native `sessionId`). Empty strings — emitted when the hook script
 * runs without `SUPERSET_AGENT_ID` set or without a session id in stdin —
 * are normalized to undefined before broadcasting.
 */
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

function emptyToUndefined(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeAgentIdentity(
	agent: z.infer<typeof agentIdentityInput>,
): AgentIdentity | undefined {
	if (!agent) return undefined;
	const agentId = emptyToUndefined(agent.agentId);
	if (!agentId) return undefined;
	const sessionId = emptyToUndefined(agent.sessionId);
	const definitionId = emptyToUndefined(agent.definitionId);
	return {
		agentId: agentId as AgentIdentity["agentId"],
		...(sessionId ? { sessionId } : {}),
		...(definitionId
			? { definitionId: definitionId as AgentIdentity["definitionId"] }
			: {}),
	};
}

export const notificationsRouter = router({
	/**
	 * Agent lifecycle hook. The agent shell script POSTs here on
	 * session-start / permission-request / task-complete events. We normalize
	 * the event type, resolve the terminal's workspace, and fan out over the
	 * WebSocket event bus so clients (desktop renderer, web) can play the
	 * finish sound themselves.
	 *
	 * Intentionally unauthenticated. The only thing a caller can do is
	 * cause clients to chime and flash a sidebar indicator — no code
	 * execution, no data access, no state change. Reusing the host-service
	 * PSK for this endpoint would leak the credential into every agent
	 * shell's env for zero practical gain (manifest.authToken already
	 * exposes it to any user-level process).
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

		ctx.eventBus.broadcastAgentLifecycle({
			workspaceId: terminalSession.originWorkspaceId,
			eventType,
			terminalId: input.terminalId,
			...(agent ? { agent } : {}),
			occurredAt: Date.now(),
		});

		return { success: true, ignored: false as const };
	}),
});
