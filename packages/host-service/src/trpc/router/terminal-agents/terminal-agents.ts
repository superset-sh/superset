import {
	type AgentDefinitionId,
	BUILTIN_AGENT_IDS,
} from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostDb } from "../../../db";
import {
	createTerminalSessionInternal,
	disposeSessionAndWait,
} from "../../../terminal/terminal";
import type {
	TerminalAgentBinding,
	TerminalAgentId,
	TerminalAgentStore,
} from "../../../terminal-agents";
import {
	claimResumeCandidateBinding,
	findResumeCandidateBinding,
	seedEndedTerminalAgentBinding,
	unclaimResumeCandidateBinding,
} from "../../../terminal-agents/persistence";
import { protectedProcedure, router } from "../../index";
import {
	type AgentRunResult,
	resolveHostAgentConfig,
	runAgentInWorkspace,
} from "../agents/agents";
import { toTerminalSessionError } from "../terminal/errors";

type GetOrCreateResult = {
	binding: TerminalAgentBinding;
	created: boolean;
};

const inflight = new Map<string, Promise<GetOrCreateResult>>();

/**
 * `resumed: false` means there was nothing to do — no candidate, resume not
 * supported, or another caller already consumed it. Launch failures throw
 * (after un-claiming) instead.
 */
export type ResumeResult =
	| { resumed: true; terminalId: string; label: string }
	| { resumed: false };

export interface ResumeSessionDeps {
	db: HostDb;
	terminalAgentStore: TerminalAgentStore;
	runAgent: (input: {
		workspaceId: string;
		agent: string;
		prompt: string;
		resumeSessionId: string;
	}) => Promise<AgentRunResult>;
	disposeSession: (terminalId: string) => Promise<unknown>;
}

const resumeInflight = new Map<string, Promise<ResumeResult>>();

/**
 * Idempotently resume the agent session behind a dead terminal into a fresh
 * terminal. The candidate is claimed with an atomic end-reason flip before
 * launching, and concurrent callers for the same terminal coalesce onto one
 * in-flight launch, so any number of panes/windows/retries produce exactly
 * one resumed session — later callers either share its result or get
 * `{ resumed: false }`. The dead terminal is disposed after a successful
 * launch; a failed launch un-claims the candidate so it can be retried.
 */
export async function resumeTerminalAgentSession(
	deps: ResumeSessionDeps,
	input: { workspaceId: string; terminalId: string },
): Promise<ResumeResult> {
	const { workspaceId, terminalId } = input;
	const key = `${workspaceId}::${terminalId}`;
	const pending = resumeInflight.get(key);
	if (pending) return pending;

	const promise = (async (): Promise<ResumeResult> => {
		const claimed = claimResumeCandidateBinding(
			deps.db,
			workspaceId,
			terminalId,
		);
		if (!claimed?.agentSessionId) return { resumed: false };

		const config = resolveHostAgentConfig(
			deps.db,
			claimed.definitionId ?? claimed.agentId,
		);
		if (!config || config.resumeArgs.length === 0) {
			// Config gone or resume unsupported — leave the candidate intact
			// rather than silently destroying the session id.
			unclaimResumeCandidateBinding(deps.db, terminalId);
			return { resumed: false };
		}

		let result: AgentRunResult;
		try {
			result = await deps.runAgent({
				workspaceId,
				agent: config.id,
				prompt: "",
				resumeSessionId: claimed.agentSessionId,
			});
		} catch (error) {
			unclaimResumeCandidateBinding(deps.db, terminalId);
			throw error;
		}

		// The replaced terminal is dead (or a respawned empty shell nobody
		// asked for) — drop it now that the session lives elsewhere.
		await deps.disposeSession(terminalId).catch((cleanupError) => {
			console.warn(
				"[terminal-agents] failed to dispose resumed-from terminal",
				{ terminalId, cleanupError },
			);
		});
		deps.terminalAgentStore.markTerminalDisposed(terminalId);

		return {
			resumed: true,
			terminalId: result.sessionId,
			label: result.label,
		};
	})();

	resumeInflight.set(key, promise);
	try {
		return await promise;
	} finally {
		resumeInflight.delete(key);
	}
}

function inflightKey(
	workspaceId: string,
	agentId: TerminalAgentId,
	definitionId: AgentDefinitionId | undefined,
): string {
	return `${workspaceId}::${agentId}::${definitionId ?? ""}`;
}

const terminalAgentIdSchema = z.enum(BUILTIN_AGENT_IDS);
const agentDefinitionIdSchema = z.union([
	z.enum(BUILTIN_AGENT_IDS),
	z.string().regex(/^custom:.+$/, "must be a builtin id or `custom:<name>`"),
]) as z.ZodType<AgentDefinitionId>;

const GET_OR_CREATE_TIMEOUT_MS = 10_000;

export const terminalAgentsRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.terminalAgentStore.list();
	}),

	listByWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				agentId: terminalAgentIdSchema.optional(),
				definitionId: agentDefinitionIdSchema.optional(),
			}),
		)
		.query(({ ctx, input }) => {
			const { workspaceId, agentId, definitionId } = input;
			return ctx.terminalAgentStore.listByWorkspace(workspaceId, {
				...(agentId ? { agentId } : {}),
				...(definitionId ? { definitionId } : {}),
			});
		}),

	findActive: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				agentId: terminalAgentIdSchema,
				definitionId: agentDefinitionIdSchema.optional(),
			}),
		)
		.query(({ ctx, input }) => {
			return (
				ctx.terminalAgentStore.findActive(
					input.workspaceId,
					input.agentId,
					input.definitionId,
				) ?? null
			);
		}),

	/**
	 * The resumable agent session behind a dead terminal, if any: the binding
	 * captured an agent session id and the terminal died under the agent
	 * (kill, crash, daemon death, reboot) rather than the agent detaching
	 * cleanly. `agent` is the value to pass to `agents.run` together with
	 * `resumeSessionId`; `resumeSupported` is false when the matching agent
	 * config has no resume args (or the config was removed).
	 */
	resumeCandidate: protectedProcedure
		.input(z.object({ workspaceId: z.string(), terminalId: z.string() }))
		.query(({ ctx, input }) => {
			const binding = findResumeCandidateBinding(
				ctx.db,
				input.workspaceId,
				input.terminalId,
			);
			if (!binding?.agentSessionId) return null;

			const config = resolveHostAgentConfig(
				ctx.db,
				binding.definitionId ?? binding.agentId,
			);
			return {
				terminalId: binding.terminalId,
				agentId: binding.agentId,
				definitionId: binding.definitionId ?? null,
				agentSessionId: binding.agentSessionId,
				endedAt: binding.endedAt ?? null,
				agent: config?.id ?? binding.agentId,
				agentLabel: config?.label ?? binding.agentId,
				resumeSupported: (config?.resumeArgs.length ?? 0) > 0,
			};
		}),

	/** See {@link resumeTerminalAgentSession}. */
	resume: protectedProcedure
		.input(z.object({ workspaceId: z.string(), terminalId: z.string() }))
		.mutation(({ ctx, input }) =>
			resumeTerminalAgentSession(
				{
					db: ctx.db,
					terminalAgentStore: ctx.terminalAgentStore,
					runAgent: (runInput) => runAgentInWorkspace(ctx, runInput),
					disposeSession: (terminalId) =>
						disposeSessionAndWait(terminalId, ctx.db),
				},
				input,
			),
		),

	/**
	 * Seed a resume candidate for a terminal recreated by the v1→v2 pane
	 * migration: the v1 pane's captured agent session, stamped ended, so the
	 * migrated pane auto-resumes through the same `resume` path as a killed
	 * v2 session.
	 * No-ops when the terminal already earned a real binding.
	 */
	seedResumeCandidate: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				terminalId: z.string(),
				agentId: terminalAgentIdSchema,
				agentSessionId: z.string().min(1),
				definitionId: agentDefinitionIdSchema.optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const result = seedEndedTerminalAgentBinding(ctx.db, input);
			if (result === "terminal-not-found") {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No terminal ${input.terminalId} in workspace ${input.workspaceId}`,
				});
			}
			return { seeded: result === "seeded" };
		}),

	/**
	 * Status-clearing escape hatch: force the workspace's bindings (or just
	 * `terminalId`'s) to `Stop` so a wedged working/permission indicator
	 * resets. Used by sidebar "Clear Status" and the pane interrupt handler
	 * (agents fire no hook on Esc/Ctrl+C). Deliberately not a hook event —
	 * it must not broadcast a completion chime/notification. Safe on live
	 * agents: their next hook event re-asserts the real state.
	 */
	clearWorkspaceStatuses: protectedProcedure
		.input(
			z.object({ workspaceId: z.string(), terminalId: z.string().optional() }),
		)
		.mutation(({ ctx, input }) => {
			ctx.terminalAgentStore.clearWorkspaceStatuses(
				input.workspaceId,
				input.terminalId,
			);
			return { success: true };
		}),

	/**
	 * Reuse-or-launch primitive. Returns an existing active binding for the
	 * `(workspaceId, agentId, definitionId)` triple, or spawns a fresh
	 * terminal and waits up to 10s for the agent's hook to register.
	 *
	 * Resolves on the first lifecycle hook — not on REPL prompt-readiness.
	 * Callers that need to `terminal.writeInput` immediately should add
	 * their own readiness wait. Input formatting also lives in the caller.
	 */
	getOrCreate: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				agentId: terminalAgentIdSchema,
				definitionId: agentDefinitionIdSchema.optional(),
				initialCommand: z.string().trim().min(1).optional(),
				cwd: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId, agentId, definitionId } = input;
			const existing = ctx.terminalAgentStore.findActive(
				workspaceId,
				agentId,
				definitionId,
			);
			if (existing) {
				return { binding: existing, created: false };
			}

			// Coalesce concurrent callers so the same triple doesn't spawn twice.
			const key = inflightKey(workspaceId, agentId, definitionId);
			const pending = inflight.get(key);
			if (pending) return pending;

			const promise = (async (): Promise<GetOrCreateResult> => {
				const terminalId = crypto.randomUUID();
				const created = await createTerminalSessionInternal({
					terminalId,
					workspaceId,
					db: ctx.db,
					eventBus: ctx.eventBus,
					...(input.initialCommand
						? { initialCommand: input.initialCommand }
						: {}),
					...(input.cwd ? { cwd: input.cwd } : {}),
				});

				if ("error" in created) {
					throw toTerminalSessionError(created);
				}

				try {
					const binding = await waitForBinding({
						store: ctx.terminalAgentStore,
						workspaceId,
						agentId,
						definitionId,
						terminalId: created.terminalId,
						timeoutMs: GET_OR_CREATE_TIMEOUT_MS,
					});
					return { binding, created: true };
				} catch (err) {
					// Hook never landed — tear down the orphaned pty so retries
					// don't pile up zombies.
					await disposeSessionAndWait(created.terminalId, ctx.db).catch(
						(cleanupError) => {
							console.warn(
								"[terminal-agents] failed to dispose timed-out terminal",
								{ terminalId: created.terminalId, cleanupError },
							);
						},
					);
					throw err;
				}
			})();

			inflight.set(key, promise);
			try {
				return await promise;
			} finally {
				inflight.delete(key);
			}
		}),
});

interface WaitForBindingArgs {
	store: import("../../../terminal-agents").TerminalAgentStore;
	workspaceId: string;
	agentId: TerminalAgentId;
	definitionId?: AgentDefinitionId;
	terminalId: string;
	timeoutMs: number;
}

function waitForBinding({
	store,
	workspaceId,
	agentId,
	definitionId,
	terminalId,
	timeoutMs,
}: WaitForBindingArgs): Promise<TerminalAgentBinding> {
	return new Promise((resolve, reject) => {
		const match = (): TerminalAgentBinding | undefined => {
			const binding = store.get(terminalId);
			if (!binding) return undefined;
			if (binding.workspaceId !== workspaceId) return undefined;
			if (binding.agentId !== agentId) return undefined;
			if (definitionId !== undefined && binding.definitionId !== definitionId)
				return undefined;
			return binding;
		};

		const immediate = match();
		if (immediate) {
			resolve(immediate);
			return;
		}

		const onChange = () => {
			const hit = match();
			if (!hit) return;
			cleanup();
			resolve(hit);
		};
		const cleanup = () => {
			clearTimeout(timer);
			store.off("change", onChange);
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(
				new TRPCError({
					code: "TIMEOUT",
					message: `Timed out after ${timeoutMs}ms waiting for ${agentId} to attach to ${terminalId}`,
				}),
			);
		}, timeoutMs);

		store.on("change", onChange);
	});
}
