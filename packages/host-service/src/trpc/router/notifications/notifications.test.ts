import { Database } from "bun:sqlite";
import { describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { terminalSessions, workspaces } from "../../../db/schema";
import type { AgentLifecycleEventType } from "../../../events";
import type { WorkspaceChangedMessage } from "../../../events/types";
import { TerminalAgentStore } from "../../../terminal-agents";
import type { HostServiceContext } from "../../../types";
import {
	getLocalWorkspace,
	insertLocalWorkspace,
} from "../../../workspaces/local-workspace-store";
import { notificationsRouter } from "./notifications";

interface BroadcastedAgentLifecycleEvent {
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	terminalId: string;
	agent?: AgentIdentity;
	occurredAt: number;
}

function createContext(
	originWorkspaceId: string | null,
	options?: { taskId?: string | null },
): {
	ctx: HostServiceContext;
	broadcastAgentLifecycle: ReturnType<
		typeof mock<(event: BroadcastedAgentLifecycleEvent) => void>
	>;
	findFirst: ReturnType<typeof mock>;
	taskStart: ReturnType<
		typeof mock<(input: { id: string }) => Promise<unknown>>
	>;
	terminalAgentStore: TerminalAgentStore;
} {
	const broadcastAgentLifecycle = mock(
		(_event: BroadcastedAgentLifecycleEvent) => {},
	);
	const findFirst = mock(() => ({
		sync: () =>
			originWorkspaceId === null
				? null
				: {
						originWorkspaceId,
					},
	}));
	const workspaceFindFirst = mock(() => ({
		sync: () => ({ taskId: options?.taskId ?? null }),
	}));
	const taskStart = mock((_input: { id: string }) => Promise.resolve({}));
	const terminalAgentStore = new TerminalAgentStore();

	const ctx = {
		db: {
			query: {
				terminalSessions: {
					findFirst,
				},
				workspaces: {
					findFirst: workspaceFindFirst,
				},
			},
			// The activity touch (workspaces/local-workspace-store) reads and
			// writes the row; these stubs keep it a silent no-op here. The
			// real write path is covered by the in-memory DB tests below.
			update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
			select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }),
		},
		api: {
			task: {
				start: {
					mutate: taskStart,
				},
			},
		},
		eventBus: {
			broadcastAgentLifecycle,
			broadcastWorkspaceChanged: () => {},
		},
		terminalAgentStore,
	} as unknown as HostServiceContext;

	return {
		ctx,
		broadcastAgentLifecycle,
		findFirst,
		taskStart,
		terminalAgentStore,
	};
}

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

/**
 * A context over a real migrated in-memory DB, for asserting the row-level
 * side effects of a hook (the activity stamp) rather than the fan-out.
 */
function createDbContext({
	terminalId,
	workspaceId,
}: {
	terminalId: string;
	workspaceId: string;
}): {
	ctx: HostServiceContext;
	db: HostDb;
	workspaceChanged: WorkspaceChangedMessage[];
} {
	const sqlite = new Database(":memory:");
	const bunDb = drizzle(sqlite, { schema });
	migrate(bunDb, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	const db = bunDb as unknown as HostDb;

	const workspaceChanged: WorkspaceChangedMessage[] = [];
	const eventBus = {
		broadcastAgentLifecycle: () => {},
		broadcastWorkspaceChanged: (
			message: Omit<WorkspaceChangedMessage, "type">,
		) => {
			workspaceChanged.push({ type: "workspace:changed", ...message });
		},
	};

	insertLocalWorkspace(
		{ db, eventBus: eventBus as unknown as HostServiceContext["eventBus"] },
		{
			id: workspaceId,
			projectId: null,
			worktreePath: `/tmp/${workspaceId}`,
			branch: "feature",
			name: "feature",
		},
	);
	// Start from "never touched" so the first hook must write.
	db.update(workspaces)
		.set({ lastActivityAt: null })
		.where(eq(workspaces.id, workspaceId))
		.run();
	db.insert(terminalSessions)
		.values({ id: terminalId, originWorkspaceId: workspaceId, createdAt: 1 })
		.run();
	workspaceChanged.length = 0;

	const ctx = {
		db,
		api: { task: { start: { mutate: () => Promise.resolve({}) } } },
		eventBus,
		terminalAgentStore: new TerminalAgentStore(),
	} as unknown as HostServiceContext;

	return { ctx, db, workspaceChanged };
}

describe("notificationsRouter.hook", () => {
	it("derives workspaceId from terminalId before broadcasting", async () => {
		const { ctx, broadcastAgentLifecycle, findFirst } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "task_complete",
		});

		expect(result).toEqual({ success: true, ignored: false });
		expect(findFirst).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-1",
			eventType: "Stop",
			terminalId: "terminal-1",
		});
		expect(typeof broadcastAgentLifecycle.mock.calls[0]?.[0].occurredAt).toBe(
			"number",
		);
	});

	it("ignores missing or unknown terminal ids", async () => {
		const missingTerminal = createContext("workspace-1");
		const missingResult = await notificationsRouter
			.createCaller(missingTerminal.ctx)
			.hook({ eventType: "Stop" });

		expect(missingResult).toEqual({ success: true, ignored: true });
		expect(missingTerminal.findFirst).not.toHaveBeenCalled();
		expect(missingTerminal.broadcastAgentLifecycle).not.toHaveBeenCalled();

		const unknownTerminal = createContext(null);
		const unknownResult = await notificationsRouter
			.createCaller(unknownTerminal.ctx)
			.hook({ terminalId: "terminal-missing", eventType: "Stop" });

		expect(unknownResult).toEqual({ success: true, ignored: true });
		expect(unknownTerminal.findFirst).toHaveBeenCalledTimes(1);
		expect(unknownTerminal.broadcastAgentLifecycle).not.toHaveBeenCalled();
	});

	it("ignores unknown event types before looking up the terminal", async () => {
		const { ctx, broadcastAgentLifecycle, findFirst } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "unknown-event",
		});

		expect(result).toEqual({ success: true, ignored: true });
		expect(findFirst).not.toHaveBeenCalled();
		expect(broadcastAgentLifecycle).not.toHaveBeenCalled();
	});

	it("forwards agent identity when the hook stamps it", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
		expect(broadcastAgentLifecycle.mock.calls[0]?.[0]).toMatchObject({
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});
	});

	it("normalizes empty-string identity fields to undefined", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "claude", sessionId: "" },
		});

		const broadcast = broadcastAgentLifecycle.mock.calls[0]?.[0];
		expect(broadcast?.agent).toEqual({ agentId: "claude" });
	});

	it("records the event onto the terminal agent store", async () => {
		const { ctx, terminalAgentStore } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "SessionStart",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		const binding = terminalAgentStore.get("terminal-1");
		expect(binding?.agentId).toBe("claude");
		expect(binding?.agentSessionId).toBe("session-abc");
		expect(binding?.workspaceId).toBe("workspace-1");
		expect(binding?.lastEventType).toBe("Attached");
	});

	it("maps Claude Code's StopFailure API-error hook to a Failed event and records it", async () => {
		const { ctx, broadcastAgentLifecycle, terminalAgentStore } =
			createContext("workspace-1");
		const caller = notificationsRouter.createCaller(ctx);

		await caller.hook({
			terminalId: "terminal-1",
			eventType: "SessionStart",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});
		const result = await caller.hook({
			terminalId: "terminal-1",
			eventType: "StopFailure",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		expect(result).toEqual({ success: true, ignored: false });
		const failedBroadcast = broadcastAgentLifecycle.mock.calls.at(-1)?.[0];
		expect(failedBroadcast).toMatchObject({
			workspaceId: "workspace-1",
			eventType: "Failed",
			terminalId: "terminal-1",
			// Failed keeps the agent identifiable, unlike an exit that drops it.
			agent: { agentId: "claude", sessionId: "session-abc" },
		});
		const binding = terminalAgentStore.get("terminal-1");
		expect(binding?.lastEventType).toBe("Failed");
		expect(binding?.agentId).toBe("claude");
		expect(binding?.agentSessionId).toBe("session-abc");
	});

	it("nudges the linked task to In Progress once per task on Start events", async () => {
		// Unique per test: the once-per-process dedup set is module-level.
		const taskId = "task-nudge-once";
		const { ctx, taskStart } = createContext("workspace-1", { taskId });
		const caller = notificationsRouter.createCaller(ctx);

		await caller.hook({ terminalId: "terminal-1", eventType: "Start" });
		await caller.hook({ terminalId: "terminal-1", eventType: "Start" });

		expect(taskStart).toHaveBeenCalledTimes(1);
		expect(taskStart.mock.calls[0]?.[0]).toEqual({ id: taskId });
	});

	it("retries the nudge on a later Start event after a failed call", async () => {
		const taskId = "task-nudge-retry";
		const { ctx, taskStart } = createContext("workspace-1", { taskId });
		taskStart.mockImplementationOnce(() =>
			Promise.reject(new Error("cloud unreachable")),
		);
		const caller = notificationsRouter.createCaller(ctx);

		await caller.hook({ terminalId: "terminal-1", eventType: "Start" });
		// let the rejection handler clear the dedup entry
		await new Promise((resolve) => setTimeout(resolve, 0));
		await caller.hook({ terminalId: "terminal-1", eventType: "Start" });

		expect(taskStart).toHaveBeenCalledTimes(2);
	});

	it("does not nudge the task when the workspace has no linked task", async () => {
		const { ctx, taskStart } = createContext("workspace-1", { taskId: null });

		await notificationsRouter
			.createCaller(ctx)
			.hook({ terminalId: "terminal-1", eventType: "Start" });

		expect(taskStart).not.toHaveBeenCalled();
	});

	it("does not nudge the task on non-Start events", async () => {
		const { ctx, taskStart } = createContext("workspace-1", {
			taskId: "task-nudge-stop",
		});

		await notificationsRouter
			.createCaller(ctx)
			.hook({ terminalId: "terminal-1", eventType: "Stop" });

		expect(taskStart).not.toHaveBeenCalled();
	});

	it("drops agent identity entirely when agentId is missing", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");

		await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-1",
			eventType: "Stop",
			agent: { agentId: "" },
		});

		const broadcast = broadcastAgentLifecycle.mock.calls[0]?.[0];
		expect(broadcast?.agent).toBeUndefined();
	});

	it("stamps the terminal's workspace lastActivityAt and broadcasts it", async () => {
		const workspaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
		const { ctx, db, workspaceChanged } = createDbContext({
			terminalId: "terminal-activity",
			workspaceId,
		});
		const updatedAtBefore = getLocalWorkspace(db, workspaceId)?.updatedAt;
		const before = Date.now();

		const result = await notificationsRouter.createCaller(ctx).hook({
			terminalId: "terminal-activity",
			eventType: "UserPromptSubmit",
			agent: { agentId: "claude", sessionId: "session-abc" },
		});

		expect(result).toEqual({ success: true, ignored: false });
		const row = getLocalWorkspace(db, workspaceId);
		expect(row?.lastActivityAt ?? 0).toBeGreaterThanOrEqual(before);
		// Activity is not a metadata edit.
		expect(row?.updatedAt).toBe(updatedAtBefore);
		expect(workspaceChanged).toHaveLength(1);
		expect(workspaceChanged[0]).toMatchObject({
			workspaceId,
			eventType: "updated",
			workspace: { id: workspaceId, lastActivityAt: row?.lastActivityAt },
		});
	});

	it("does not fail the hook when the activity write throws", async () => {
		const { ctx, broadcastAgentLifecycle } = createContext("workspace-1");
		(ctx.db as unknown as { update: () => never }).update = () => {
			throw new Error("disk full");
		};
		const warn = console.warn;
		const warnings: unknown[][] = [];
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};
		try {
			const result = await notificationsRouter
				.createCaller(ctx)
				.hook({ terminalId: "terminal-1", eventType: "Stop" });

			expect(result).toEqual({ success: true, ignored: false });
			expect(broadcastAgentLifecycle).toHaveBeenCalledTimes(1);
			expect(
				warnings.some((args) =>
					String(args[0]).includes("failed to record activity"),
				),
			).toBe(true);
		} finally {
			console.warn = warn;
		}
	});
});
