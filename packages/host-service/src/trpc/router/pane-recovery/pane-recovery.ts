import {
	parseTerminalRecoverySnapshot,
	type TerminalRecoverySnapshot,
	terminalRecoverySnapshotSchema,
} from "@superset/shared/terminal-recovery";
import { TRPCError } from "@trpc/server";
import {
	and,
	desc,
	eq,
	getTableColumns,
	gt,
	isNull,
	lt,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import {
	closedPanes,
	terminalSessions,
	workspaces,
} from "../../../db/schema.ts";
import { getDaemonClient } from "../../../terminal/daemon-client-singleton.ts";
import {
	TerminalLifecycleOperations,
	terminalLifecycleState,
} from "../../../terminal/lifecycle/lifecycle.ts";
import {
	captureSessionRecoverySnapshot,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	getPendingTerminalWorkspaceId,
} from "../../../terminal/terminal.ts";
import { getTerminalAgentBinding } from "../../../terminal-agents/persistence";
import { protectedProcedure, router } from "../../index.ts";
import {
	recoverTerminalAgentSession,
	resumeSessionDepsFor,
} from "../terminal-agents/terminal-agents";

const operations = new TerminalLifecycleOperations();
const scope = z.object({ workspaceId: z.string() });
const entry = z.object({
	id: z.string().uuid(),
	paneId: z.string().min(1).max(128),
	title: z.string().max(256),
	titleOverride: z.string().max(256).optional(),
	pane: z.discriminatedUnion("kind", [
		z.object({
			kind: z.literal("terminal"),
			terminalId: z.string().min(1).max(128),
			terminate: z.boolean(),
			scrollback: z.string().max(262144).optional(),
			snapshot: terminalRecoverySnapshotSchema.optional(),
		}),
		z.object({ kind: z.literal("file"), filePath: z.string().max(4096) }),
		z.object({
			kind: z.literal("browser"),
			url: z
				.string()
				.max(8192)
				.refine((value) => /^(https?:\/\/|about:blank$)/.test(value)),
		}),
	]),
});

export const paneRecoveryRouter = router({
	close: protectedProcedure
		.input(scope.extend({ entries: z.array(entry).min(1).max(100) }))
		.mutation(({ ctx, input }) =>
			operations.run(input.workspaceId, async () => {
				const workspace = ctx.db.query.workspaces
					.findFirst({ where: eq(workspaces.id, input.workspaceId) })
					.sync();
				if (!workspace)
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Workspace not found",
					});
				for (const item of input.entries) {
					const previous = ctx.db.query.closedPanes
						.findFirst({ where: eq(closedPanes.id, item.id) })
						.sync();
					if (
						previous &&
						(previous.workspaceId !== input.workspaceId ||
							previous.paneId !== item.paneId ||
							previous.kind !== item.pane.kind ||
							previous.restoredAt ||
							(item.pane.kind === "terminal" &&
								previous.terminalId !== item.pane.terminalId) ||
							(item.pane.kind === "file" &&
								previous.descriptor.filePath !== item.pane.filePath) ||
							(item.pane.kind === "browser" &&
								previous.descriptor.url !== item.pane.url))
					)
						throw new TRPCError({
							code: "CONFLICT",
							message: "Close request already used",
						});
					if (item.pane.kind !== "terminal") continue;
					const terminal = ctx.db.query.terminalSessions
						.findFirst({ where: eq(terminalSessions.id, item.pane.terminalId) })
						.sync();
					const owner =
						terminal?.originWorkspaceId ??
						getPendingTerminalWorkspaceId(item.pane.terminalId);
					if (owner && owner !== input.workspaceId)
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "Terminal belongs to another workspace",
						});
				}
				const disposing = new Set(
					input.entries.flatMap((item) =>
						item.pane.kind === "terminal" && item.pane.terminate
							? [item.pane.terminalId]
							: [],
					),
				);
				const snapshots = new Map<string, TerminalRecoverySnapshot>();
				for (const item of input.entries) {
					if (item.pane.kind !== "terminal") continue;
					const hostSnapshot = await captureSessionRecoverySnapshot({
						snapshot: item.pane.snapshot,
						terminalId: item.pane.terminalId,
						workspaceId: input.workspaceId,
						db: ctx.db,
						eventBus: ctx.eventBus,
					});
					const snapshot = hostSnapshot ?? item.pane.snapshot;
					if (snapshot) snapshots.set(item.id, snapshot);
				}
				ctx.db.transaction((tx) => {
					tx.delete(closedPanes)
						.where(lt(closedPanes.expiresAt, Date.now()))
						.run();
					for (const item of input.entries) {
						const descriptor: Record<string, string> =
							item.pane.kind === "file"
								? { filePath: item.pane.filePath }
								: item.pane.kind === "browser"
									? { url: item.pane.url }
									: {
											terminalId: item.pane.terminalId,
											...(item.pane.scrollback
												? { scrollback: item.pane.scrollback }
												: {}),
											...(!disposing.has(item.pane.terminalId)
												? { reuseTerminalId: item.pane.terminalId }
												: {}),
										};
						const snapshot = snapshots.get(item.id);
						if (snapshot) {
							descriptor.snapshot = JSON.stringify(snapshot);
							if (snapshot.cwd) descriptor.cwd = snapshot.cwd;
						}
						if (item.pane.kind === "terminal") {
							const binding = getTerminalAgentBinding(
								ctx.db,
								item.pane.terminalId,
							);
							if (binding) descriptor.agentId = binding.agentId;
						}
						if (item.titleOverride)
							descriptor.titleOverride = item.titleOverride;
						const now = Date.now();
						tx.insert(closedPanes)
							.values({
								id: item.id,
								workspaceId: input.workspaceId,
								paneId: item.paneId,
								kind: item.pane.kind,
								title: item.title,
								descriptor,
								terminalId:
									item.pane.kind === "terminal" ? item.pane.terminalId : null,
								closedAt: now,
								expiresAt: now + 86_400_000,
							})
							.onConflictDoNothing()
							.run();
					}
					for (const terminalId of disposing) {
						tx.insert(terminalSessions)
							.values({
								id: terminalId,
								originWorkspaceId: input.workspaceId,
								status: "disposed",
								disposeRequestedAt: Date.now(),
							})
							.onConflictDoUpdate({
								target: terminalSessions.id,
								set: { disposeRequestedAt: Date.now() },
								setWhere: isNull(terminalSessions.disposeRequestedAt),
							})
							.run();
					}
					const overflow = tx
						.select({ id: closedPanes.id })
						.from(closedPanes)
						.where(eq(closedPanes.workspaceId, input.workspaceId))
						.orderBy(desc(closedPanes.closedAt))
						.all()
						.slice(100);
					for (const row of overflow)
						tx.delete(closedPanes).where(eq(closedPanes.id, row.id)).run();
					let retainedBytes = 0;
					const archives = tx
						.select({
							id: closedPanes.id,
							bytes: sql<number>`length(cast(${closedPanes.descriptor} as blob))`,
						})
						.from(closedPanes)
						.orderBy(desc(closedPanes.closedAt))
						.all();
					for (const archive of archives) {
						retainedBytes += archive.bytes;
						if (retainedBytes > 50 * 1024 * 1024)
							tx.delete(closedPanes)
								.where(eq(closedPanes.id, archive.id))
								.run();
					}
				});
				await Promise.all(
					[...disposing].map(async (terminalId) => {
						ctx.terminalAgentStore.markTerminalDisposed(terminalId);
						await disposeSessionAndWait(terminalId, ctx.db);
					}),
				);
				return input.entries.map((item) => item.id);
			}),
		),
	list: protectedProcedure.input(scope).query(({ ctx, input }) =>
		ctx.db
			.select({
				...getTableColumns(closedPanes),
				descriptor:
					sql`json_remove(${closedPanes.descriptor}, '$.scrollback', '$.snapshot')`.mapWith(
						closedPanes.descriptor,
					),
			})
			.from(closedPanes)
			.where(
				and(
					eq(closedPanes.workspaceId, input.workspaceId),
					isNull(closedPanes.restoredAt),
					gt(closedPanes.expiresAt, Date.now()),
				),
			)
			.orderBy(desc(closedPanes.closedAt))
			.limit(20)
			.all(),
	),
	restore: protectedProcedure
		.input(scope.extend({ id: z.string().uuid() }))
		.mutation(({ ctx, input }) =>
			operations.run(input.workspaceId, async () => {
				const row = ctx.db.query.closedPanes
					.findFirst({
						where: and(
							eq(closedPanes.id, input.id),
							eq(closedPanes.workspaceId, input.workspaceId),
						),
					})
					.sync();
				if (!row || row.expiresAt <= Date.now())
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Closed pane is no longer available",
					});
				if (!row.terminalId)
					return {
						status: "ready" as const,
						entry: { ...row, freshShell: false },
					};
				const lifecycle = (id: string) =>
					terminalLifecycleState(
						ctx.db.query.terminalSessions
							.findFirst({ where: eq(terminalSessions.id, id) })
							.sync(),
					);
				let terminalId = row.restoredTerminalId;
				if (
					terminalId &&
					["disposed", "exited"].includes(lifecycle(terminalId))
				)
					terminalId = null;
				if (!terminalId) {
					let live = false;
					if (
						row.descriptor.reuseTerminalId &&
						lifecycle(row.terminalId) === "active"
					)
						live = (await (await getDaemonClient()).list()).some(
							(session) => session.id === row.terminalId && session.alive,
						);
					if (live) terminalId = row.terminalId;
					else {
						const resumed = await recoverTerminalAgentSession(
							resumeSessionDepsFor(ctx),
							{
								workspaceId: input.workspaceId,
								terminalId: row.terminalId,
								restoredTerminalId: row.restoredTerminalId,
							},
						);
						terminalId = resumed.resumed
							? resumed.terminalId
							: crypto.randomUUID();
					}
					ctx.db
						.update(closedPanes)
						.set({ restoredTerminalId: terminalId })
						.where(eq(closedPanes.id, row.id))
						.run();
				}
				if (terminalId !== row.terminalId) {
					const snapshot = parseTerminalRecoverySnapshot(row.descriptor);
					const created = await createTerminalSessionInternal({
						terminalId,
						workspaceId: input.workspaceId,
						db: ctx.db,
						eventBus: ctx.eventBus,
						cwd: snapshot?.cwd,
						cols: snapshot?.cols,
						rows: snapshot?.rows,
					});
					if ("error" in created)
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: created.error,
						});
				}
				const descriptor: Record<string, string> = {
					...row.descriptor,
					terminalId,
				};
				delete descriptor.snapshot;
				delete descriptor.scrollback;
				return {
					status: "ready" as const,
					entry: {
						...row,
						restoredTerminalId: terminalId,
						descriptor,
						freshShell: terminalId !== row.terminalId,
					},
				};
			}),
		),
	acknowledge: protectedProcedure
		.input(scope.extend({ id: z.string().uuid() }))
		.mutation(({ ctx, input }) => {
			ctx.db
				.update(closedPanes)
				.set({ restoredAt: Date.now() })
				.where(
					and(
						eq(closedPanes.id, input.id),
						eq(closedPanes.workspaceId, input.workspaceId),
						isNull(closedPanes.terminalId),
					),
				)
				.run();
			return { ok: true };
		}),
});
