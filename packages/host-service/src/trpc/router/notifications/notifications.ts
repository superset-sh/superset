import type { AgentIdentity } from "@superset/shared/agent-identity";
import { desktopNotificationSchema } from "@superset/shared/desktop-notification";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions } from "../../../db/schema";
import { mapEventType } from "../../../events";
import { verifyAttributionToken } from "../../../terminal-agents/attribution-token";
import { recordTerminalAgentTranscriptPath } from "../../../terminal-agents/persistence";
import { isTrustedTranscriptPath } from "../../../terminal-agents/transcript-path";
import { protectedProcedure, publicProcedure, router } from "../../index";
import {
	captureSessionAccount,
	sameSessionAccountContext,
} from "../usage/session-account/session-account";
import { fanOutAgentLifecycle } from "./fan-out-agent-lifecycle";
import { showDesktopNotification } from "./show-desktop-notification";

// Hook scripts emit "" for unset env vars; we coerce to undefined so the
// AgentIdentity broadcast carries only meaningful fields.
const agentIdentityInput = z
	.object({
		agentId: z.string().optional(),
		sessionId: z.string().optional(),
		definitionId: z.string().optional(),
	})
	.optional();

// Set when the hook fired inside a subagent (Claude Task tool, Codex
// spawn_agent). Such events feed the terminal's subagent roster only.
const subagentInput = z
	.object({
		id: z.string(),
		type: z.string().optional(),
		/** The child's hook session id — a Codex child's own thread id. */
		sessionId: z.string().optional(),
		transcriptPath: z.string().optional(),
		agentTranscriptPath: z.string().optional(),
	})
	.optional();

const hookInput = z.object({
	terminalId: z.string().optional(),
	eventType: z.string().optional(),
	agent: agentIdentityInput,
	preview: z
		.string()
		.transform((value) => value.slice(0, 4000))
		.optional(),
	subagent: subagentInput,
	launchId: z.string().max(128).optional(),
	accountProfile: z.string().max(4096).optional(),
	apiKey: z.boolean().optional(),
	attributionToken: z.string().max(128).optional(),
	transcriptPath: z.string().max(4096).optional(),
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

export function createNotificationsRouter(
	captureAccount = captureSessionAccount,
) {
	return router({
		/** A notification sent with `superset notifications show`, shown by the attached desktop app. */
		show: protectedProcedure
			.input(desktopNotificationSchema)
			.mutation(({ ctx, input }) => showDesktopNotification(ctx, input)),

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
			const subagentId = trimOrUndefined(input.subagent?.id);
			const eventType = subagentId ? undefined : mapEventType(input.eventType);
			if (!subagentId && !eventType) {
				return { success: true, ignored: true as const };
			}

			if (
				!input.terminalId ||
				ctx.terminalAgentStore.hasChat(input.terminalId)
			) {
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

			const occurredAt = Date.now();

			// Subagent activity is not the terminal's lifecycle: no chime, no
			// status change, no session id capture. The roster change is fanned
			// out as an invalidation so the sidebar refetches bindings.
			if (subagentId) {
				const agentType = trimOrUndefined(input.subagent?.type);
				const recorded = ctx.terminalAgentStore.recordSubagentHook({
					terminalId: input.terminalId,
					workspaceId: terminalSession.originWorkspaceId,
					eventType: input.eventType ?? "",
					subagentId,
					...(agentType ? { agentType } : {}),
					hint: {
						subagentId,
						sessionId: trimOrUndefined(input.subagent?.sessionId),
						transcriptPath: trimOrUndefined(input.subagent?.transcriptPath),
						agentTranscriptPath: trimOrUndefined(
							input.subagent?.agentTranscriptPath,
						),
					},
					occurredAt,
				});
				if (!recorded) {
					return { success: true, ignored: true as const };
				}
				ctx.eventBus.broadcastAgentBindingsChanged({
					workspaceId: terminalSession.originWorkspaceId,
					occurredAt,
				});
				return { success: true, ignored: false as const };
			}
			if (!eventType) {
				return { success: true, ignored: true as const };
			}

			const agent = normalizeAgentIdentity(input.agent);
			const preview = trimOrUndefined(input.preview);

			const prior = ctx.terminalAgentStore.get(input.terminalId);
			const verifiedAttribution = verifyAttributionToken(
				input.terminalId,
				input.attributionToken,
			);
			if (
				(prior?.account?.pinned || prior?.accountInvalid) &&
				!verifiedAttribution &&
				((agent?.agentId && agent.agentId !== prior.agentId) ||
					(input.launchId && input.launchId !== prior.launchId) ||
					(agent?.sessionId && agent.sessionId !== prior.agentSessionId))
			)
				return { success: true, ignored: true as const };
			const shouldCaptureAccount =
				verifiedAttribution &&
				eventType === "Attached" &&
				input.accountProfile !== undefined &&
				(prior?.account?.pinned ||
					!prior?.account ||
					prior.agentId !== agent?.agentId ||
					(input.launchId && input.launchId !== prior.launchId) ||
					(agent?.sessionId &&
						prior.agentSessionId &&
						agent.sessionId !== prior.agentSessionId));
			let account = shouldCaptureAccount
				? await captureAccount(
						agent?.agentId,
						input.accountProfile as string,
						input.apiKey ?? false,
					).catch(() => undefined)
				: undefined;
			let binding = prior;
			let metadataOnly = false;
			if (shouldCaptureAccount) {
				const current = ctx.terminalAgentStore.get(input.terminalId);
				const sameOwner = prior
					? current &&
						current.agentId === prior.agentId &&
						current.launchId === prior.launchId &&
						current.definitionId === prior.definitionId &&
						current.startedAt === prior.startedAt &&
						(current.agentSessionId === prior.agentSessionId ||
							(prior.agentSessionId === undefined &&
								(!agent?.sessionId ||
									current.agentSessionId === agent.sessionId)))
					: !current ||
						(input.launchId &&
							current.launchId === input.launchId &&
							current.agentId === agent?.agentId &&
							(!agent?.sessionId ||
								!current.agentSessionId ||
								current.agentSessionId === agent.sessionId));
				const unchangedAccount =
					(!current?.account && !prior?.account) ||
					sameSessionAccountContext(current?.account, prior?.account) ||
					(!prior?.account &&
						sameSessionAccountContext(current?.account, account)) ||
					(prior?.account?.pinned &&
						current?.account?.pinned &&
						sameSessionAccountContext(
							{ ...current.account, conflict: prior.account.conflict },
							prior.account,
						));
				if (
					!sameOwner ||
					!unchangedAccount ||
					current?.accountInvalid !== prior?.accountInvalid
				)
					return { success: true, ignored: true as const };
				binding = current;
				metadataOnly =
					current !== undefined &&
					(current.lastEventAt !== prior?.lastEventAt ||
						current.lastEventType !== prior?.lastEventType ||
						current.agentSessionId !== prior?.agentSessionId);
				if (
					metadataOnly &&
					((agent?.agentId && agent.agentId !== current?.agentId) ||
						(input.launchId && input.launchId !== current?.launchId) ||
						(agent?.sessionId &&
							current?.agentSessionId &&
							agent.sessionId !== current.agentSessionId))
				)
					return { success: true, ignored: true as const };
			}
			// A same-launch mismatch cannot downgrade a pin to default-account
			// recovery. Retain the requested identity with a conflict marker instead.
			// A genuinely new CLI in the shell gets its own unpinned attribution.
			if (
				shouldCaptureAccount &&
				binding?.account?.pinned &&
				(!binding.launchId || binding.launchId === input.launchId)
			) {
				const matches =
					account &&
					binding.account.agent === account.agent &&
					binding.account.identity === account.identity &&
					binding.account.directory === account.directory;
				account =
					!account || matches
						? binding.account
						: { ...binding.account, conflict: true };
			}
			if (metadataOnly) {
				ctx.terminalAgentStore.updateMetadata(input.terminalId, {
					account,
					agentSessionId: agent?.sessionId,
					definitionId: agent?.definitionId,
				});
			} else {
				ctx.terminalAgentStore.recordEvent({
					account,
					launchId: trimOrUndefined(input.launchId),
					terminalId: input.terminalId,
					workspaceId: terminalSession.originWorkspaceId,
					eventType,
					...(agent?.agentId ? { agentId: agent.agentId } : {}),
					...(agent?.sessionId ? { agentSessionId: agent.sessionId } : {}),
					...(agent?.definitionId ? { definitionId: agent.definitionId } : {}),
					occurredAt,
				});
			}

			const transcriptPath = trimOrUndefined(input.transcriptPath);
			if (
				agent?.sessionId &&
				transcriptPath &&
				isTrustedTranscriptPath(transcriptPath)
			) {
				recordTerminalAgentTranscriptPath(ctx.db, {
					terminalId: input.terminalId,
					agentSessionId: agent.sessionId,
					transcriptPath,
				});
			}

			if (metadataOnly) {
				ctx.eventBus.broadcastAgentBindingsChanged({
					workspaceId: terminalSession.originWorkspaceId,
					occurredAt,
				});
				return { success: true, ignored: false as const };
			}

			fanOutAgentLifecycle(ctx, {
				workspaceId: terminalSession.originWorkspaceId,
				eventType,
				terminalId: input.terminalId,
				...(agent ? { agent } : {}),
				...(preview ? { preview } : {}),
				occurredAt,
			});

			return { success: true, ignored: false as const };
		}),
	});
}

export const notificationsRouter = createNotificationsRouter();
