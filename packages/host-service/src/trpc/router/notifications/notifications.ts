import type { AgentIdentity } from "@superset/shared/agent-identity";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions } from "../../../db/schema";
import type { AgentLifecycleEventType } from "../../../events";
import { mapEventType } from "../../../events";
import type { HostServiceContext } from "../../../types";
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
	notificationType: z.string().optional(),
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

interface DispatchLifecycleInput {
	terminalId: string;
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	agent: AgentIdentity | undefined;
}

function dispatchLifecycleEvent(
	ctx: HostServiceContext,
	{ terminalId, workspaceId, eventType, agent }: DispatchLifecycleInput,
): void {
	const occurredAt = Date.now();

	ctx.eventBus.broadcastAgentLifecycle({
		workspaceId,
		eventType,
		terminalId,
		...(agent ? { agent } : {}),
		occurredAt,
	});

	ctx.terminalAgentStore.recordEvent({
		terminalId,
		workspaceId,
		eventType,
		...(agent?.agentId ? { agentId: agent.agentId } : {}),
		...(agent?.sessionId ? { agentSessionId: agent.sessionId } : {}),
		...(agent?.definitionId ? { definitionId: agent.definitionId } : {}),
		occurredAt,
	});
}

function canPublishDelayedGrokPermission(
	ctx: HostServiceContext,
	terminalId: string,
	agent: AgentIdentity,
): boolean {
	const binding = ctx.terminalAgentStore.get(terminalId);
	if (binding?.agentId !== "grok" || binding.lastEventType !== "Start") {
		return false;
	}
	if (
		agent.sessionId &&
		binding.agentSessionId &&
		agent.sessionId !== binding.agentSessionId
	) {
		return false;
	}

	const session = ctx.db.query.terminalSessions
		.findFirst({
			where: eq(terminalSessions.id, terminalId),
			columns: { status: true },
		})
		.sync();
	return session?.status === "active";
}

export const notificationsRouter = router({
	/**
	 * Agent lifecycle hook. The shell hook POSTs here; we normalize, resolve
	 * the terminal's workspace, and fan out over the WS event bus.
	 *
	 * Intentionally unauthenticated: a caller can only trigger a chime and a
	 * sidebar indicator. Reusing the host-service PSK would leak it into every
	 * agent shell's env for zero practical gain.
	 */
	hook: publicProcedure.input(hookInput).mutation(async ({ ctx, input }) => {
		if (!input.terminalId || !input.eventType) {
			return { success: true, ignored: true as const };
		}
		const terminalId = input.terminalId;
		const rawEventType = input.eventType;
		const agent = normalizeAgentIdentity(input.agent);
		const isGrok = agent?.agentId === "grok";
		const eventType = isGrok ? null : mapEventType(input.eventType);
		if (!isGrok && !eventType) {
			return { success: true, ignored: true as const };
		}

		const terminalSession = ctx.db.query.terminalSessions
			.findFirst({
				where: eq(terminalSessions.id, terminalId),
				columns: { originWorkspaceId: true, status: true },
			})
			.sync();
		if (
			!terminalSession?.originWorkspaceId ||
			terminalSession.status !== "active"
		) {
			return { success: true, ignored: true as const };
		}
		const workspaceId = terminalSession.originWorkspaceId;

		const dispatch = (normalizedEventType: AgentLifecycleEventType): void => {
			if (
				normalizedEventType === "PermissionRequest" &&
				(!agent || !canPublishDelayedGrokPermission(ctx, terminalId, agent))
			) {
				return;
			}
			dispatchLifecycleEvent(ctx, {
				terminalId,
				workspaceId,
				eventType: normalizedEventType,
				agent,
			});
		};

		if (isGrok) {
			const recognized = ctx.grokLifecycle.handle(
				{
					key: terminalId,
					eventType: rawEventType,
					notificationType: input.notificationType,
					sessionId: agent.sessionId,
				},
				dispatch,
			);
			return { success: true, ignored: !recognized };
		}

		if (eventType) dispatch(eventType);

		return { success: true, ignored: false as const };
	}),
});
