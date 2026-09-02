import { TERMINAL_HANDOFF_MAX_CHARS } from "@superset/shared/terminal-session-handoff";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSupervisor, waitForDaemonReady } from "../../../daemon";
import { terminalSessions, workspaces } from "../../../db/schema";
import {
	createTerminalSessionInternal,
	disposeSessionAndWait,
	disposeSessionsByWorkspaceId,
	disposeSessionsByWorktreePath,
	listLiveTerminalSessions,
	parseThemeType,
	sessionHasRunningProcess,
	snapshotSession,
	transcriptSession,
	writeFramedInputToSession,
	writeInputToSession,
} from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { toTerminalSessionError } from "./errors";

export const createSessionInputSchema = z.object({
	workspaceId: z.string(),
	terminalId: z.string().optional(),
	// An empty or whitespace-only command means "open a shell with no initial
	// command" (e.g. a preset with no command), so normalize it to absent
	// instead of rejecting. `launchSession` still requires a non-empty command.
	initialCommand: z
		.string()
		.trim()
		.optional()
		.transform((value) => (value ? value : undefined)),
	cwd: z.string().optional(),
	themeType: z.string().optional(),
	cols: z.number().int().positive().optional(),
	rows: z.number().int().positive().optional(),
});

async function createTerminalSessionFromInput({
	ctx,
	input,
}: {
	ctx: HostServiceContext;
	input: z.infer<typeof createSessionInputSchema>;
}) {
	const terminalId = input.terminalId ?? crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		themeType: parseThemeType(input.themeType),
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: input.initialCommand,
		cwd: input.cwd,
		cols: input.cols,
		rows: input.rows,
	});

	if ("error" in result) {
		throw toTerminalSessionError(result);
	}

	return {
		terminalId: result.terminalId,
		status: "active" as const,
	};
}

// Daemon control surface — sibling to the per-workspace terminal ops above.
// Org-scoped (one daemon per host-service); org id comes from request ctx
// rather than env so this module can be imported in tests where env vars
// aren't set.
// Supervisor lives in this same process so calls go through the in-process
// singleton, not over the wire.
const daemonRouter = router({
	getUpdateStatus: protectedProcedure.query(({ ctx }) =>
		getSupervisor().getUpdateStatus(ctx.organizationId),
	),

	/**
	 * Whether the daemon is still answering, and for how long it hasn't.
	 * Deliberately does not `waitForDaemonReady` — this is polled by the
	 * terminal UI to decide whether a stall is worth surfacing, so it has to
	 * answer immediately rather than block on the thing that may be wedged.
	 */
	getHealth: protectedProcedure.query(({ ctx }) =>
		getSupervisor().getHealth(ctx.organizationId),
	),

	listSessions: protectedProcedure.query(async ({ ctx }) => {
		// Wait for the bootstrap so the supervisor has a socket path.
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().listSessions(ctx.organizationId);
	}),

	restart: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().restart(ctx.organizationId);
	}),

	/**
	 * Phase 2: hand off live PTYs to a successor daemon binary.
	 *
	 * Sessions survive on success — the kernel master fds are inherited by
	 * the new daemon process via stdio. The renderer surfaces this as the
	 * "Update" path (vs `restart` which kills sessions). On failure, the
	 * UI offers force-restart as a fallback.
	 */
	update: protectedProcedure.mutation(async ({ ctx }) => {
		await waitForDaemonReady(ctx.organizationId);
		return getSupervisor().update(ctx.organizationId);
	}),
});

export const terminalRouter = router({
	createSession: protectedProcedure
		.input(createSessionInputSchema)
		.mutation(createTerminalSessionFromInput),

	launchSession: protectedProcedure
		.input(
			createSessionInputSchema.extend({
				initialCommand: z.string().trim().min(1),
			}),
		)
		.mutation(createTerminalSessionFromInput),

	list: protectedProcedure
		.input(
			z
				.object({
					workspaceId: z.string().optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => ({
			sessions: await listLiveTerminalSessions(ctx.db, {
				workspaceId: input?.workspaceId,
			}),
		})),

	hasRunningProcess: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.query(({ input }) => ({
			running: sessionHasRunningProcess(input.terminalId, input.workspaceId),
		})),

	writeInput: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				data: z.string(),
			}),
		)
		.mutation(({ input }) => {
			const result = writeInputToSession(input);
			if ("error" in result) {
				throw toTerminalSessionError(result);
			}
			return { success: true as const };
		}),

	// Send a follow-up message into an already-running terminal (e.g. a
	// claude/codex agent) instead of spawning a new session. Multi-line text
	// is framed as a bracketed paste server-side.
	send: protectedProcedure
		.input(
			z
				.object({
					terminalId: z.string(),
					workspaceId: z.string(),
					text: z.string(),
					submit: z.boolean().default(true),
				})
				.refine((input) => input.submit || input.text.length > 0, {
					message: "Nothing to send",
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const result = await writeFramedInputToSession({
				...input,
				db: ctx.db,
				eventBus: ctx.eventBus,
			});
			if ("error" in result) {
				throw toTerminalSessionError(result);
			}
			return { terminalId: input.terminalId, submitted: input.submit };
		}),

	// Non-destructive snapshot of the terminal's current screen + recent
	// scrollback, read off the per-session headless emulator.
	snapshot: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				maxLines: z.number().int().positive().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const result = await snapshotSession({
				...input,
				db: ctx.db,
				eventBus: ctx.eventBus,
			});
			if ("error" in result) {
				throw toTerminalSessionError(result);
			}
			const { success: _success, ...snapshot } = result;
			return { terminalId: input.terminalId, ...snapshot };
		}),

	// Recent output as readable text for handing context to another agent.
	// Reads the retained PTY stream, not the visible screen — see
	// transcriptSession.
	transcript: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
				// Capped, not just positive: the budget sizes a response the host
				// builds in memory, so a client cannot ask for an arbitrary one.
				maxChars: z
					.number()
					.int()
					.positive()
					.max(TERMINAL_HANDOFF_MAX_CHARS)
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const result = await transcriptSession({
				...input,
				db: ctx.db,
				eventBus: ctx.eventBus,
			});
			if ("error" in result) {
				throw toTerminalSessionError(result);
			}
			const { success: _success, ...transcript } = result;
			return { terminalId: input.terminalId, ...transcript };
		}),

	killSession: protectedProcedure
		.input(
			z.object({
				terminalId: z.string(),
				workspaceId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const session = ctx.db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, input.terminalId) })
				.sync();

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Terminal session not found",
				});
			}

			if (session.originWorkspaceId !== input.workspaceId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Terminal session does not belong to this workspace",
				});
			}

			// Mark the binding disposed BEFORE the kill: the SIGHUP death-gasp and
			// pty-exit events that follow would otherwise stamp it
			// "terminal-exited" and auto-resume would resurrect a deliberately
			// killed session at the next pane mount.
			ctx.terminalAgentStore.markTerminalDisposed(input.terminalId);
			await disposeSessionAndWait(input.terminalId, ctx.db);
			return { terminalId: input.terminalId, status: "disposed" as const };
		}),

	// Kill every session (including backgrounded, renderer-detached ones) for a
	// workspace. Called by delete paths that don't run the full
	// workspaceCleanup.destroy, so their terminals don't leak in the daemon.
	disposeWorkspaceSessions: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(({ ctx, input }) =>
			disposeSessionsByWorkspaceId(input.workspaceId, ctx.db),
		),

	// Like disposeWorkspaceSessions but for a closed worktree, which no longer
	// has a workspace id — resolve sessions through the shared worktree path.
	disposeWorktreeSessions: protectedProcedure
		.input(z.object({ worktreePath: z.string() }))
		.mutation(({ ctx, input }) =>
			disposeSessionsByWorktreePath(input.worktreePath, ctx.db),
		),

	daemon: daemonRouter,
});
