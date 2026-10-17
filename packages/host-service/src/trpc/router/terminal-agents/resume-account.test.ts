import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import {
	hostAgentConfigs,
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../../../db/schema";
import type { SessionAccount } from "../usage/session-account/session-account";
import {
	accountResumeSource,
	type ResumeWithAccountDeps,
	resumeTerminalWithAccount,
} from "./resume-account";

const databases: Database[] = [];
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});
const sourceAccount: SessionAccount = {
	agent: "claude",
	selection: "/fixture/source",
	directory: "/fixture/source",
	identity: "a".repeat(64),
	credentialKind: "subscription",
};
const targetAccount: SessionAccount = {
	...sourceAccount,
	selection: "/fixture/target",
	directory: "/fixture/target",
	identity: "b".repeat(64),
	pinned: true,
};
const sourceInput = { workspaceId: "workspace", terminalId: "source" };
const history = {
	path: "/fixture/shared/exact-session.jsonl",
	device: 1,
	inode: 2,
	size: 50,
	modifiedAt: 3,
	changedAt: 4,
	sha256: "c".repeat(64),
};
function fixture(provider: "claude" | "codex" = "claude") {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	db.insert(workspaces)
		.values({
			id: "workspace",
			worktreePath: "/fixture/workspace",
			branch: "main",
		})
		.run();
	db.insert(hostAgentConfigs)
		.values({
			id: "custom:fixture",
			presetId: provider,
			label: provider,
			command: provider,
			promptTransport: "argv",
			resumeArgsJson: JSON.stringify(
				provider === "claude" ? ["--resume"] : ["resume"],
			),
			displayOrder: 0,
		})
		.run();
	db.insert(terminalSessions)
		.values({
			id: "source",
			originWorkspaceId: "workspace",
			status: "active",
			createdAt: 1,
		})
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId: "source",
			workspaceId: "workspace",
			definitionId: "custom:fixture",
			agentId: provider,
			agentSessionId: "exact-session",
			accountJson: JSON.stringify({ ...sourceAccount, agent: provider }),
			startedAt: 1,
			lastEventAt: 2,
			lastEventType: "Stop",
			endedAt: 3,
			endReason: "detached",
		})
		.run();
	const calls: Parameters<ResumeWithAccountDeps["runAgent"]>[0][] = [];
	const events: Parameters<
		ResumeWithAccountDeps["eventBus"]["broadcastTerminalLifecycle"]
	>[0][] = [];
	const deps: ResumeWithAccountDeps = {
		db,
		runAgent: async (input) => {
			if (!input.terminalLaunch) throw new Error("Expected guarded launch");
			await input.terminalLaunch.beforeInitialCommand();
			input.terminalLaunch.onInitialCommandReady();
			calls.push(input);
			return {
				kind: "terminal",
				sessionId: input.terminalLaunch.terminalId,
				label: provider,
			};
		},
		eventBus: {
			broadcastTerminalLifecycle: (event) => {
				events.push(event);
			},
		},
		resolveAccount: async () => ({ ...targetAccount, agent: provider }),
		validateRouting: async () => {},
		assertIdle: async () => {},
		assertNoClaudeWriter: async () => {},
		inspectHistory: async () => history,
	};
	const input = () => ({
		...sourceInput,
		expectedRevision:
			accountResumeSource(db, sourceInput)?.revision ?? "missing",
		account: {
			selection: targetAccount.selection,
			identity: targetAccount.identity,
		},
	});
	const binding = () =>
		db
			.select()
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "source"))
			.get();
	return { db, deps, calls, events, input, binding };
}

describe("resume an ended native conversation with a selected account", () => {
	test.each([
		"claude",
		"codex",
	] as const)("resumes exact %s identity without a prompt or source terminal disposal", async (provider) => {
		const f = fixture(provider);
		const before = f.db.select().from(terminalSessions).all();
		const result = await resumeTerminalWithAccount(f.deps, f.input());
		expect(result).toMatchObject({ resumed: true, label: provider });
		expect(result.terminalId).toMatch(/^[0-9a-f-]{36}$/);
		expect(f.calls).toMatchObject([
			{
				workspaceId: "workspace",
				agent: "custom:fixture",
				prompt: "",
				surface: "terminal",
				resumeSessionId: "exact-session",
				account: { ...targetAccount, agent: provider },
			},
		]);
		expect(f.binding()?.resumedIntoTerminalId).toBe(
			f.calls[0]?.terminalLaunch?.terminalId,
		);
		expect(f.events[0]).toMatchObject({
			terminalId: "source",
			eventType: "resumed",
			resumedTerminalId: f.calls[0]?.terminalLaunch?.terminalId,
		});
		expect(f.db.select().from(terminalSessions).all()).toEqual(before);
	});

	test.each([
		null,
		"malformed",
		JSON.stringify({ ...sourceAccount, conflict: true }),
	])("refuses unavailable or conflicting original account metadata", async (accountJson) => {
		const f = fixture();
		f.db.update(terminalAgentBindings).set({ accountJson }).run();
		expect(accountResumeSource(f.db, sourceInput)).toMatchObject({
			ready: false,
		});
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"original account context",
		);
		expect(f.calls).toHaveLength(0);
	});

	test("refuses an agent that has not exited normally", async () => {
		const f = fixture();
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: null, endReason: null })
			.run();
		expect(accountResumeSource(f.db, sourceInput)).toMatchObject({
			ready: false,
		});
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"Exit this agent normally",
		);
		expect(f.calls).toHaveLength(0);
	});

	test("refuses a stale source revision before resolving the destination", async () => {
		const f = fixture();
		const input = f.input();
		f.db.update(terminalAgentBindings).set({ agentSessionId: "other" }).run();
		let resolved = false;
		f.deps.resolveAccount = async () => {
			resolved = true;
			return targetAccount;
		};
		await expect(resumeTerminalWithAccount(f.deps, input)).rejects.toThrow(
			"changed",
		);
		expect(resolved).toBe(false);
		expect(f.calls).toHaveLength(0);
	});

	test.each([
		"resolveAccount",
		"validateRouting",
		"assertIdle",
		"assertNoClaudeWriter",
		"inspectHistory",
	] as const)("does not consume recovery when %s refuses", async (guard) => {
		const f = fixture();
		const before = f.binding();
		f.deps[guard] = async () => {
			throw new Error("refused");
		};
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"refused",
		);
		expect(f.binding()).toEqual(before);
		expect(f.calls).toHaveLength(0);
	});

	test("refuses another known active binding for the exact conversation", async () => {
		const f = fixture();
		const binding = f.binding();
		if (!binding) throw new Error("Expected fixture binding");
		f.db
			.insert(terminalAgentBindings)
			.values({
				...binding,
				terminalId: "other",
				endedAt: null,
				endReason: null,
			})
			.run();
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"running agent",
		);
		expect(f.binding()?.endReason).toBe("detached");
		expect(f.calls).toHaveLength(0);
	});

	test("coalesces neither duplicate clicks nor silent fresh launches", async () => {
		const f = fixture();
		const input = f.input();
		let release!: () => void;
		const paused = new Promise<void>((resolve) => {
			release = resolve;
		});
		f.deps.resolveAccount = async () => {
			await paused;
			return targetAccount;
		};
		const first = resumeTerminalWithAccount(f.deps, input);
		await expect(resumeTerminalWithAccount(f.deps, input)).rejects.toThrow(
			"changed",
		);
		release();
		await first;
		expect(f.calls).toHaveLength(1);
		await expect(resumeTerminalWithAccount(f.deps, input)).rejects.toThrow(
			"changed",
		);
		expect(f.calls).toHaveLength(1);
	});

	test.each([
		"detached",
		"terminal-exited",
		"disposed",
	])("restores the %s recovery claim when launch fails", async (endReason) => {
		const f = fixture();
		f.db.update(terminalAgentBindings).set({ endReason }).run();
		const before = f.binding();
		f.deps.runAgent = async () => {
			throw new Error("launch failed");
		};
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"launch failed",
		);
		expect(f.binding()).toEqual(before);
		expect(f.events).toHaveLength(0);
	});

	test("refuses a transcript that grew during the claim without consuming recovery", async () => {
		const f = fixture();
		let count = 0;
		f.deps.inspectHistory = async () => ({
			...history,
			size: ++count === 1 ? 50 : 100,
		});
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"changed",
		);
		expect(f.binding()?.endReason).toBe("detached");
		expect(f.calls).toHaveLength(0);
	});

	test.each([
		"workspace",
		"config",
	])("refuses a changed %s after the final asynchronous guard", async (kind) => {
		const f = fixture();
		let count = 0;
		f.deps.inspectHistory = async () => {
			if (++count === 2) {
				if (kind === "workspace")
					f.db
						.update(workspaces)
						.set({ worktreePath: "/other/workspace" })
						.run();
				else f.db.update(hostAgentConfigs).set({ label: "changed" }).run();
			}
			return history;
		};
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"changed",
		);
		expect(f.binding()?.endReason).toBe("detached");
		expect(f.calls).toHaveLength(0);
	});

	test("does not roll back a newly observed source binding", async () => {
		const f = fixture();
		let count = 0;
		f.deps.inspectHistory = async () => {
			if (++count === 2)
				f.db
					.update(terminalAgentBindings)
					.set({
						lastEventAt: 8,
						agentSessionId: "new-observed-id",
						endReason: null,
						endedAt: null,
					})
					.run();
			return history;
		};
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"changed",
		);
		expect(f.binding()).toMatchObject({
			agentSessionId: "new-observed-id",
			endReason: null,
			endedAt: null,
			lastEventAt: 8,
		});
		expect(f.calls).toHaveLength(0);
	});

	test("retains the consumed claim if notification fails after launch", async () => {
		const f = fixture();
		f.deps.eventBus.broadcastTerminalLifecycle = () => {
			throw new Error("notification failed");
		};
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"notification failed",
		);
		expect(f.binding()?.endReason).toBe("resumed");
		expect(f.binding()?.resumedIntoTerminalId).toBe(
			f.calls[0]?.terminalLaunch?.terminalId,
		);
		expect(f.calls).toHaveLength(1);
	});
	test("retries a pre-command crash claim without consuming or modifying the abandoned shell", async () => {
		const f = fixture();
		f.db
			.insert(terminalSessions)
			.values({
				id: "abandoned-shell",
				status: "active",
				originWorkspaceId: "workspace",
				createdAt: 4,
			})
			.run();
		f.db
			.update(terminalAgentBindings)
			.set({
				endReason: "account-resume-preparing:detached",
				resumedIntoTerminalId: "abandoned-shell",
			})
			.run();
		const terminals = f.db.select().from(terminalSessions).all();
		expect(accountResumeSource(f.db, sourceInput)?.ready).toBe(true);
		const result = await resumeTerminalWithAccount(f.deps, f.input());
		expect(result.terminalId).not.toBe("abandoned-shell");
		expect(f.db.select().from(terminalSessions).all()).toEqual(terminals);
	});

	test("preserves a durable successor if the host response fails after command authorization", async () => {
		const f = fixture();
		f.deps.runAgent = async (input) => {
			if (!input.terminalLaunch) throw new Error("Expected guard");
			await input.terminalLaunch.beforeInitialCommand();
			input.terminalLaunch.onInitialCommandReady();
			throw new Error("host response lost");
		};
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"host response lost",
		);
		expect(f.binding()?.endReason).toBe("resumed");
		expect(f.binding()?.resumedIntoTerminalId).toMatch(/^[0-9a-f-]{36}$/);
		expect(accountResumeSource(f.db, sourceInput)?.ready).toBe(false);
	});

	test("revalidates after launcher preflight before authorizing the command", async () => {
		const f = fixture();
		const launch = f.deps.runAgent;
		f.deps.runAgent = async (input) => {
			f.db
				.update(workspaces)
				.set({ worktreePath: "/changed-during-shell-start" })
				.run();
			return launch(input);
		};
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"changed",
		);
		expect(f.calls).toHaveLength(0);
		expect(f.binding()?.endReason).toBe("detached");
	});

	test("refuses a destination identity that changes during launcher preflight", async () => {
		const f = fixture();
		let reads = 0;
		f.deps.resolveAccount = async () =>
			++reads === 1 ? targetAccount : { ...targetAccount, identity: "changed" };
		await expect(resumeTerminalWithAccount(f.deps, f.input())).rejects.toThrow(
			"changed",
		);
		expect(f.calls).toHaveLength(0);
		expect(f.binding()?.endReason).toBe("detached");
	});
});
