import {
	type AgentDefinitionId,
	BUILTIN_AGENT_IDS,
} from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { terminalSessions, workspaces } from "../../../db/schema";
import type { EventBus } from "../../../events";
import {
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../../../terminal/env";
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
	findResumedSuccessorTerminalId,
	getTerminalAgentBinding,
	markResumeCandidateResumedInto,
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
import { resolveAgentAccountDir } from "../usage/agent-account-dir";
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
	/** Tells panes on the dead terminal where the session went. */
	eventBus: Pick<EventBus, "broadcastTerminalLifecycle">;
}

const resumeInflight = new Map<string, Promise<ResumeResult>>();

/**
 * Agent session ids are opaque tokens (both CLIs mint UUIDs). The resume
 * command is typed into the user's shell, so anything outside this alphabet
 * is refused rather than quoted: a stored id that looks like shell syntax is
 * corruption or an attempt, never a conversation worth restoring.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Continue nudges waiting for their terminal's next resume, keyed
 * `${workspaceId}::${terminalId}` (KTD8). The account mover registers one
 * before it kills a session; whichever caller then wins the `resumeInflight`
 * coalescing — the mover's own resume or the renderer's empty-prompt
 * auto-resume — launches the agent with it, so the interrupted turn proceeds
 * without the user typing. Consumed exactly once, restored when the launch it
 * was consumed for failed, and dropped only where nothing is left to resume
 * under that id — a terminal id is a fresh UUID, so that entry is unreachable
 * for good. An exit that un-claims and republishes the candidate under the
 * same terminal id keeps its nudge: the retry arrives on that id and still
 * nudges. Residual, accepted: a cold respawn rebinding the same terminal id to
 * a new session would deliver it a stale nudge.
 */
const pendingNudges = new Map<string, string>();

function nudgeKey(workspaceId: string, terminalId: string): string {
	return `${workspaceId}::${terminalId}`;
}

/** See {@link pendingNudges}. Overwrites any nudge still pending. */
export function registerPendingNudge(
	workspaceId: string,
	terminalId: string,
	nudge: string,
): void {
	pendingNudges.set(nudgeKey(workspaceId, terminalId), nudge);
}

/**
 * Whether the harness behind `binding` still holds its conversation, read
 * from the directory the relaunch will run under: the default account can
 * have changed since the session started (that is what the account-switch
 * restart is for), and session sharing makes the transcript reachable from
 * the new profile too.
 */
export function bindingHasHarnessSession(
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
		if (!claimed?.agentSessionId) {
			// Nothing left to resume under this id, and terminal ids are never
			// reused: a nudge left queued here could never be looked up again.
			pendingNudges.delete(key);
			return { resumed: false };
		}

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

		if (!SESSION_ID_PATTERN.test(claimed.agentSessionId)) {
			// Never becomes a `--resume` argument. Logged without the value.
			console.warn(
				"[terminal-agents] refusing to resume a malformed session id",
				{ terminalId },
			);
			unclaimResumeCandidateBinding(deps.db, terminalId);
			return { resumed: false };
		}

		const killPending = deps.db
			.select({
				status: terminalSessions.status,
				disposeRequestedAt: terminalSessions.disposeRequestedAt,
			})
			.from(terminalSessions)
			.where(eq(terminalSessions.id, terminalId))
			.get();
		if (
			killPending?.status === "active" &&
			killPending.disposeRequestedAt != null
		) {
			// A kill was requested and the daemon never confirmed it: the old
			// pty may still be running this conversation, so resuming now
			// would put two agents on it. Only this state is refused — a
			// confirmed kill leaves the row "disposed", a crash or daemon loss
			// leaves it "exited", and a v1->v2 seeded candidate never carries
			// the stamp. The reaper retries the kill (it reaps any row with
			// disposeRequestedAt set) and flips the row, after which this
			// republishes and resumes normally with its nudge intact.
			unclaimResumeCandidateBinding(deps.db, terminalId);
			return { resumed: false };
		}

		// Only a definite "no transcript" launches fresh: an unreadable or
		// unsurveyed store must not cost a restored conversation its history.
		const resumable =
			claimed.lastEventType !== "Attached" ||
			deps.hasSession(claimed) !== false;

		// Consumed here, not at the call site, so the winner of the coalescing
		// is the launch that carries it (KTD8).
		const nudge = pendingNudges.get(key);
		pendingNudges.delete(key);

		let result: AgentRunResult;
		try {
			result = await deps.runAgent({
				workspaceId,
				agent: config.id,
				prompt: nudge ?? "",
				...(resumable ? { resumeSessionId: claimed.agentSessionId } : {}),
			});
		} catch (error) {
			unclaimResumeCandidateBinding(deps.db, terminalId);
			// The retry that re-claims this candidate must still nudge.
			if (nudge !== undefined) pendingNudges.set(key, nudge);
			throw error;
		}

		markResumeCandidateResumedInto(deps.db, terminalId, result.sessionId);

		// The replaced terminal is dead (or a respawned empty shell nobody
		// asked for) — drop it now that the session lives elsewhere.
		await deps.disposeSession(terminalId).catch((cleanupError) => {
			console.warn(
				"[terminal-agents] failed to dispose resumed-from terminal",
				{ terminalId, cleanupError },
			);
		});
		deps.terminalAgentStore.markTerminalDisposed(terminalId);

		// Every pane on the dead terminal follows the session — the one whose
		// mutation this is, panes in other windows, and panes whose host-side
		// restart never went through a renderer at all.
		deps.eventBus.broadcastTerminalLifecycle({
			workspaceId,
			terminalId,
			eventType: "resumed",
			resumedTerminalId: result.sessionId,
			label: result.label,
			occurredAt: Date.now(),
		});

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
 * `disposeSessionAndWait` reports a kill the daemon could not confirm by
 * returning `daemonCloseSucceeded: false`, not by throwing — see
 * `DisposeSessionResult`. Read defensively because the dep is a plain
 * `Promise<unknown>`: a test double (or a future disposer) may resolve with
 * nothing at all, which is not a failure.
 */
function daemonCloseFailed(result: unknown): boolean {
	return (
		typeof result === "object" &&
		result !== null &&
		(result as { daemonCloseSucceeded?: unknown }).daemonCloseSucceeded ===
			false
	);
}

/**
 * Write the durable intent-to-kill stamp for a dispose that threw. The real
 * disposer stamps as its first statement, so a throw can mean the pty was
 * never touched — and by then the binding is already a claimable resume
 * candidate. Only this stamp makes the kill-pending guard in
 * `resumeTerminalAgentSession` refuse a resume onto a pty that may still be
 * running the conversation, and only it makes the reaper retry the kill.
 * First request time wins, like `disposeSessionAndWait`. Best-effort: a
 * failure here must not mask the dispose error the caller is reporting.
 */
function stampDisposeRequested(db: HostDb, terminalId: string): void {
	try {
		db.update(terminalSessions)
			.set({ disposeRequestedAt: Date.now() })
			.where(
				and(
					eq(terminalSessions.id, terminalId),
					isNull(terminalSessions.disposeRequestedAt),
				),
			)
			.run();
	} catch (error) {
		console.warn("[terminal-agents] failed to stamp the requested kill", {
			terminalId,
			error,
		});
	}
}

/**
 * Kill one live agent session the way a crash would and bring it straight
 * back with its conversation — the account engine's mover (KTD8).
 *
 * A kill the daemon could not confirm returns `{ resumed: false }`: the old
 * pty may still hold the session, and resuming on top of it would run two
 * agents on one conversation.
 *
 * `prompt` is registered before anything is killed, so the resume that
 * follows launches with it even if the renderer's auto-resume gets there
 * first — and when the resume it joins had already composed its prompt, this
 * reports `{ resumed: false }` rather than a nudge that never went out. The
 * binding is marked "terminal-exited", never "disposed", so it
 * stays a resume candidate; the old pty is disposed before the relaunch so
 * two processes never hold the same session id.
 *
 * Marking it exited is also what publishes it as a resume candidate, so the
 * `resumeInflight` slot is reserved before the mark and held until the kill
 * is done: a renderer auto-resume arriving in that window would otherwise
 * claim the candidate and launch a second agent while the old pty may still
 * be running the conversation. A resume that lands during the window waits on
 * this call and shares its result instead of launching.
 */
export async function killAndResumeTerminalAgent(
	deps: ResumeSessionDeps,
	input: { workspaceId: string; terminalId: string; prompt?: string },
): Promise<ResumeResult> {
	const { workspaceId, terminalId, prompt } = input;
	const key = `${workspaceId}::${terminalId}`;
	if (prompt) registerPendingNudge(workspaceId, terminalId, prompt);

	// A resume already in flight has claimed the candidate and disposes the
	// old terminal itself; joining it is what any other caller does.
	const pending = resumeInflight.get(key);
	if (pending) {
		const joined = await pending;
		// A resume reads the nudge before it is reachable through
		// `resumeInflight`, so the one just joined carries ours only when it
		// had not read one yet — the kill window reserved below. A nudge still
		// pending after the join reached no launch: report it as needing
		// attention instead of claiming a prompt that was never delivered, and
		// leave the entry for the resume that follows the caller's retry.
		if (prompt && pendingNudges.has(key)) return { resumed: false };
		return joined;
	}

	let settle!: (result: ResumeResult) => void;
	const reserved = new Promise<ResumeResult>((resolve) => {
		settle = resolve;
	});
	resumeInflight.set(key, reserved);
	// Dropped in the same turn the real resume installs its own entry, so no
	// caller can slip between the two.
	const handOver = (): void => {
		if (resumeInflight.get(key) === reserved) resumeInflight.delete(key);
	};

	try {
		deps.terminalAgentStore.markTerminalExited(terminalId);
	} catch (error) {
		// The reservation is already visible, and this write can throw for
		// real — it is a better-sqlite3 update behind a 5s busy timeout, and
		// endBinding emits a change event that rethrows a listener's throw.
		// Leaving without settling strands an unresolved promise under this
		// key, so every later resume of the terminal awaits something that
		// never completes: the pane spins forever with no error and no retry,
		// for the life of the process.
		handOver();
		settle({ resumed: false });
		console.warn("[terminal-agents] failed to record the kill before resume", {
			terminalId,
			error,
		});
		throw error;
	}
	let disposal: unknown;
	try {
		disposal = await deps.disposeSession(terminalId);
	} catch (error) {
		// The dispose can throw before it stamps its own intent to kill, and
		// the binding is already a claimable candidate: stamp it here, before
		// the reservation is released, so the kill-pending guard refuses a
		// resume onto a pty that may still be running. The reaper then retries
		// the kill (it reaps any stamped row) and flips the row out of
		// "active", after which the candidate republishes with its nudge
		// still pending and resumes normally.
		stampDisposeRequested(deps.db, terminalId);
		handOver();
		settle({ resumed: false });
		console.warn("[terminal-agents] failed to kill terminal before resume", {
			terminalId,
			error,
		});
		throw error;
	}
	if (daemonCloseFailed(disposal)) {
		// Same situation as the throw above, reported by a return value rather
		// than an exception: the old pty may still be running the session, so
		// resuming now would put two agents on one conversation. The reaper
		// retries the kill and the nudge stays pending for the resume that
		// follows it; the caller treats this as needing attention.
		handOver();
		settle({ resumed: false });
		console.warn(
			"[terminal-agents] the daemon could not confirm the kill; not resuming",
			{ terminalId },
		);
		return { resumed: false };
	}

	handOver();
	try {
		const result = await resumeTerminalAgentSession(deps, {
			workspaceId,
			terminalId,
		});
		settle(result);
		return result;
	} catch (error) {
		// Waiters are resolved, never rejected: with no waiter at all a
		// rejected reservation would surface as an unhandled rejection.
		settle({ resumed: false });
		throw error;
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
 *
 * Each row also carries the account dir the launch resolves to and whether
 * Superset owns that choice (KTD12): a session pinned to a
 * user-exported `CLAUDE_CONFIG_DIR` / `CODEX_HOME` is reported unmanaged, and
 * the account engine leaves it alone.
 */
export function listAccountRestartCandidates(
	db: HostDb,
	store: TerminalAgentStore,
	provider: "claude" | "codex",
): AccountRestartCandidate[] {
	const out: AccountRestartCandidate[] = [];
	// The host default depends only on `db` and `provider`, and resolving it
	// costs a DB query plus the pointer reads: once, not once per binding.
	const defaultEnv = resolveDefaultAccountEnv(db, provider);
	let shellEnv: Record<string, string>;
	try {
		shellEnv = getTerminalBaseEnv();
	} catch {
		// The engine reads this synchronously; until the startup snapshot is
		// ready, no session can safely be classified as movable.
		return [];
	}
	for (const listed of store.list()) {
		const binding = withEphemeralFields(store, listed);
		if (!binding.agentSessionId) continue;
		const config = resolveHostAgentConfig(
			db,
			binding.definitionId ?? binding.agentId,
		);
		if (!config || config.presetId !== provider) continue;
		if (config.resumeArgs.length === 0) continue;
		const account = resolveAgentAccountDir(db, {
			family: provider,
			shellEnv,
			env: config.env,
			defaultEnv,
		});
		out.push({
			binding,
			agentLabel: config.label,
			configDir: account.configDir,
			managed: account.managed,
		});
	}
	return out;
}

/**
 * `store.list()` is served from SQLite in production, and `lastFailure` and
 * `lastTransitionAt` have no columns there — they are in-memory only (see
 * TerminalAgentBinding). Without them the account engine never sees a Claude
 * limit stop at all, so the row it acts on is the listed one topped up from
 * the store's own map.
 */
function withEphemeralFields(
	store: TerminalAgentStore,
	listed: TerminalAgentBinding,
): TerminalAgentBinding {
	const live = store.get(listed.terminalId);
	if (!live) return listed;
	return {
		...listed,
		...(live.lastFailure === undefined
			? {}
			: { lastFailure: live.lastFailure }),
		...(live.lastTransitionAt === undefined
			? {}
			: { lastTransitionAt: live.lastTransitionAt }),
	};
}

export interface AccountRestartCandidate {
	binding: TerminalAgentBinding;
	agentLabel: string;
	/** Account dir the launch resolves to; null is the CLI's own home. */
	configDir: string | null;
	/** False for a user-pinned session the engine must never move. */
	managed: boolean;
}

/**
 * The terminal now hosting the session that was resumed out of
 * `terminalId`, for a pane that missed the "resumed" lifecycle event. The
 * label comes from the origin binding: a fresh relaunch (a session that was
 * never prompted) has no binding of its own until the agent's first hook.
 */
export function findResumedSuccessor(
	db: HostDb,
	workspaceId: string,
	terminalId: string,
): { terminalId: string; label: string } | null {
	const successorTerminalId = findResumedSuccessorTerminalId(
		db,
		workspaceId,
		terminalId,
	);
	const origin = getTerminalAgentBinding(db, terminalId);
	if (!successorTerminalId || !origin) return null;
	const config = resolveHostAgentConfig(
		db,
		origin.definitionId ?? origin.agentId,
	);
	return {
		terminalId: successorTerminalId,
		label: config?.label ?? origin.agentId,
	};
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

	/**
	 * The transcript behind a subagent row, for the subagent pane. Reads
	 * only a path the roster recorded from the child's own hook events;
	 * `transcript` is null while the child has not flushed its first record.
	 */
	subagentTranscript: protectedProcedure
		.input(z.object({ terminalId: z.string(), subagentId: z.string() }))
		.query(({ ctx, input }) =>
			ctx.terminalAgentStore.getSubagentTranscript(
				input.terminalId,
				input.subagentId,
			),
		),

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

	/** See {@link findResumedSuccessor}. */
	resumedSuccessor: protectedProcedure
		.input(z.object({ workspaceId: z.string(), terminalId: z.string() }))
		.query(({ ctx, input }) =>
			findResumedSuccessor(ctx.db, input.workspaceId, input.terminalId),
		),

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
					eventBus: ctx.eventBus,
				},
				input,
			),
		),

	/**
	 * The live sessions a default-account switch could not reach — exposed so
	 * the Usage tab can tell the user which agents stayed behind.
	 */
	accountRestartCandidates: protectedProcedure
		.input(z.object({ provider: z.enum(["claude", "codex"]) }))
		.query(async ({ ctx, input }) => {
			await waitForTerminalBaseEnv();
			return listAccountRestartCandidates(
				ctx.db,
				ctx.terminalAgentStore,
				input.provider,
			).map(({ binding, agentLabel, managed }) => ({
				terminalId: binding.terminalId,
				workspaceId: binding.workspaceId,
				agentLabel,
				managed,
			}));
		}),

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
