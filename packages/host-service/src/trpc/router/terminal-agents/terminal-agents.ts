import {
	type AgentDefinitionId,
	BUILTIN_AGENT_IDS,
} from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { workspaces } from "../../../db/schema";
import { hasHarnessSession } from "../../../terminal/harness-transcript";
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
import { resolveDefaultAccountEnv } from "../usage/default-account";

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
		resumeSessionId?: string;
	}) => Promise<AgentRunResult>;
	disposeSession: (terminalId: string) => Promise<unknown>;
	/**
	 * Whether the harness still holds a conversation for the binding's session
	 * id (`null` = cannot tell). Consulted only for a session that never
	 * progressed past "Attached".
	 */
	hasSession: (binding: TerminalAgentBinding) => boolean | null;
}

const resumeInflight = new Map<string, Promise<ResumeResult>>();

/**
 * Whether the harness behind `binding` still holds its conversation, read
 * from the directory the relaunch will run under: the default account can
 * have changed since the session started (that is what the account-switch
 * restart is for), and session sharing makes the transcript reachable from
 * the new profile too.
 */
function bindingHasHarnessSession(
	db: HostDb,
	binding: TerminalAgentBinding,
): boolean | null {
	const config = resolveHostAgentConfig(
		db,
		binding.definitionId ?? binding.agentId,
	);
	if (!config) return null;
	const worktreePath = db
		.select({ path: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.id, binding.workspaceId))
		.get()?.path;
	return hasHarnessSession({
		agentId: config.presetId,
		sessionId: binding.agentSessionId,
		worktreePath,
		env: { ...resolveDefaultAccountEnv(db, config.presetId), ...config.env },
	});
}

/**
 * Idempotently resume the agent session behind a dead terminal into a fresh
 * terminal. The candidate is claimed with an atomic end-reason flip before
 * launching, and concurrent callers for the same terminal coalesce onto one
 * in-flight launch, so any number of panes/windows/retries produce exactly
 * one resumed session — later callers either share its result or get
 * `{ resumed: false }`. The dead terminal is disposed after a successful
 * launch; a failed launch un-claims the candidate so it can be retried.
 *
 * A session still at "Attached" started but was never prompted, and agents
 * only persist a conversation once it has a message — when the harness store
 * shows none, the agent is launched fresh instead of `--resume`-ing into "no
 * conversation found". A store that does hold one (a resumed session idle
 * since its restore) or cannot be read resumes as usual. Nothing is lost
 * either way: the pane comes back as the same agent on the current default
 * account.
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

		// Only a definite "no transcript" launches fresh: an unreadable or
		// unsurveyed store must not cost a restored conversation its history.
		const resumable =
			claimed.lastEventType !== "Attached" ||
			deps.hasSession(claimed) !== false;

		let result: AgentRunResult;
		try {
			result = await deps.runAgent({
				workspaceId,
				agent: config.id,
				prompt: "",
				...(resumable ? { resumeSessionId: claimed.agentSessionId } : {}),
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

/**
 * Live agent sessions a default-account switch cannot reach: their PTY env
 * was frozen at spawn, so they keep the old login until relaunched. A
 * session qualifies when its binding captured a session id and its config
 * both belongs to `provider` — the presetId keying resolveDefaultAccountEnv —
 * and knows how to resume. A session idle since it started ("Attached")
 * counts: it is exactly the agent the user would otherwise have to close and
 * relaunch by hand, and the resume path starts it fresh when it has no
 * conversation yet. Sessions that fail the bar are left running rather than
 * killed without a way back.
 */
export function listAccountRestartCandidates(
	db: HostDb,
	store: TerminalAgentStore,
	provider: "claude" | "codex",
): Array<{ binding: TerminalAgentBinding; agentLabel: string }> {
	const out: Array<{ binding: TerminalAgentBinding; agentLabel: string }> = [];
	for (const binding of store.list()) {
		if (!binding.agentSessionId) continue;
		const config = resolveHostAgentConfig(
			db,
			binding.definitionId ?? binding.agentId,
		);
		if (!config || config.presetId !== provider) continue;
		if (config.resumeArgs.length === 0) continue;
		out.push({ binding, agentLabel: config.label });
	}
	return out;
}

export interface RestartAccountSessionsDeps {
	db: HostDb;
	terminalAgentStore: TerminalAgentStore;
	disposeSession: (terminalId: string) => Promise<unknown>;
}

/**
 * Relaunch every live `provider` agent onto the current default account.
 * Each candidate terminal is killed the way a crash would kill it — the
 * binding is marked "terminal-exited", never "disposed" — so the standard
 * auto-resume path relaunches the agent with its saved session id (or fresh,
 * for one that never got a prompt), and the agent wrapper re-resolves the
 * account pointer at launch: same conversation, new account. Marking ended
 * precedes the dispose because the renderer re-checks for a resume candidate
 * on the socket close the dispose causes; the store's own "change" event
 * never reaches it. Panes that are not open resume when their workspace is
 * next viewed, like any other
 * dead-terminal candidate.
 */
export async function restartAccountSessions(
	deps: RestartAccountSessionsDeps,
	provider: "claude" | "codex",
): Promise<{ restartedTerminalIds: string[] }> {
	const candidates = listAccountRestartCandidates(
		deps.db,
		deps.terminalAgentStore,
		provider,
	);
	const restartedTerminalIds: string[] = [];
	for (const { binding } of candidates) {
		deps.terminalAgentStore.markTerminalExited(binding.terminalId);
		try {
			await deps.disposeSession(binding.terminalId);
		} catch (error) {
			// The reaper retries the kill; the binding stays a valid candidate.
			console.warn(
				"[terminal-agents] account-switch restart failed to dispose terminal",
				{ terminalId: binding.terminalId, error },
			);
			continue;
		}
		restartedTerminalIds.push(binding.terminalId);
	}
	return { restartedTerminalIds };
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
					hasSession: (binding) => bindingHasHarnessSession(ctx.db, binding),
				},
				input,
			),
		),

	/**
	 * The sessions {@link restartAccountSessions} would relaunch — exposed
	 * separately so the Usage tab can ask before restarting anything.
	 */
	accountRestartCandidates: protectedProcedure
		.input(z.object({ provider: z.enum(["claude", "codex"]) }))
		.query(({ ctx, input }) =>
			listAccountRestartCandidates(
				ctx.db,
				ctx.terminalAgentStore,
				input.provider,
			).map(({ binding, agentLabel }) => ({
				terminalId: binding.terminalId,
				workspaceId: binding.workspaceId,
				agentLabel,
			})),
		),

	/** See {@link restartAccountSessions}. */
	restartAccountSessions: protectedProcedure
		.input(z.object({ provider: z.enum(["claude", "codex"]) }))
		.mutation(({ ctx, input }) =>
			restartAccountSessions(
				{
					db: ctx.db,
					terminalAgentStore: ctx.terminalAgentStore,
					disposeSession: (terminalId) =>
						disposeSessionAndWait(terminalId, ctx.db),
				},
				input.provider,
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
			ctx.eventBus.broadcastAgentBindingsChanged({
				workspaceId: input.workspaceId,
				occurredAt: Date.now(),
			});
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
