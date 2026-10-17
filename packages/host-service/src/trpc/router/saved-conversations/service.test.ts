import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
	appendFile,
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import {
	savedConversations,
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../../../db/schema";
import { claudeProjectDirName } from "../../../terminal-agents/harness-sessions/claude";
import { SqliteTerminalAgentBindingPersistence } from "../../../terminal-agents/persistence";
import { TerminalAgentStore } from "../../../terminal-agents/store";
import type { AgentRunInput } from "../agents/agents";
import {
	accountResumeSource,
	resumeTerminalWithAccount,
} from "../terminal-agents/resume-account";
import { resumeTerminalAgentSession } from "../terminal-agents/terminal-agents";
import type { SessionAccount } from "../usage/session-account/session-account";
import { revision, unavailable } from "./history";
import {
	adoptNativeConversation,
	listSavedConversations,
	openSavedConversation,
	type SavedConversationDeps,
} from "./service";

const fixtures: Array<{ directory: string; sqlite: Database }> = [];
afterEach(async () => {
	for (const { directory, sqlite } of fixtures.splice(0)) {
		sqlite.close();
		await rm(directory, { recursive: true, force: true });
	}
});
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

async function fixture() {
	const directory = await realpath(
		await mkdtemp(join(tmpdir(), "saved-native-test-")),
	);
	const cwd = join(directory, "workspace");
	const profile = join(directory, "profile");
	const project = join(profile, "projects", claudeProjectDirName(cwd));
	await mkdir(cwd);
	await mkdir(project, { recursive: true });
	const sqlite = new Database(":memory:");
	fixtures.push({ directory, sqlite });
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	sqlite.exec("PRAGMA foreign_keys=ON");
	db.insert(workspaces)
		.values({ id: "workspace", branch: "main", worktreePath: cwd })
		.run();
	db.insert(schema.hostAgentConfigs)
		.values({
			id: "claude",
			presetId: "claude",
			label: "Claude",
			command: "claude",
			promptTransport: "argv",
			resumeArgsJson: '["--resume"]',
			displayOrder: 0,
		})
		.run();
	const account: SessionAccount = {
		agent: "claude",
		selection: profile,
		directory: profile,
		credentialKind: "subscription",
		identity: "a".repeat(64),
		email: "review@example.test",
		pinned: true,
	};
	const launches: AgentRunInput[] = [];
	const deps: SavedConversationDeps = {
		db,
		checkpointDirectory: join(directory, "checkpoints"),
		resolveAccount: async (_config, choice) => {
			if (
				choice.identity !== account.identity ||
				choice.selection !== account.selection
			)
				unavailable("The selected account changed.");
			return { ...account };
		},
		validateRouting: async () => {},
		assertNoWriter: async () => {},
		assertPreviousIdle: async () => {},
		runAgent: async (input) => {
			launches.push(input);
			const launch = input.terminalLaunch;
			if (!launch) throw new Error("guard required");
			await launch.beforeInitialCommand();
			db.transaction(() => {
				db.insert(terminalSessions)
					.values({
						id: launch.terminalId,
						originWorkspaceId: "workspace",
						createdAt: 1,
					})
					.run();
				db.insert(terminalAgentBindings)
					.values({
						terminalId: launch.terminalId,
						workspaceId: "workspace",
						agentId: "claude",
						agentSessionId: input.resumeSessionId,
						definitionId: "claude",
						accountJson: JSON.stringify(input.account),
						startedAt: 1,
						lastEventAt: 1,
						lastEventType: "Attached",
					})
					.run();
				launch.onInitialCommandReady();
			});
			return {
				kind: "terminal",
				sessionId: launch.terminalId,
				label: "Claude",
			};
		},
	};
	const input = {
		workspaceId: "workspace",
		agent: "claude",
		account: { selection: profile, identity: account.identity },
	};
	const content = (id: string, text = "Synthetic saved history") =>
		`${JSON.stringify({ type: "user", sessionId: id, cwd, uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", message: { role: "user", content: text } })}\n${JSON.stringify({ type: "assistant", sessionId: id, cwd, uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", message: { role: "assistant", content: [{ type: "text", text: "Synthetic reply" }] } })}\n`;
	const write = async (id = firstId) => {
		await writeFile(join(project, `${id}.jsonl`), content(id));
	};
	const adopt = async (id = firstId) => {
		const list = await listSavedConversations(deps, input);
		const candidate = list.candidates.find(
			(item) => item.nativeSessionId === id,
		);
		if (!candidate) throw new Error("missing fixture candidate");
		return adoptNativeConversation(deps, {
			...input,
			nativeSessionId: id,
			expectedRevision: candidate.revision,
		});
	};
	const openSaved = async (id: string) => {
		const row = db
			.select()
			.from(savedConversations)
			.where(eq(savedConversations.id, id))
			.get();
		if (!row) throw new Error("missing fixture adoption");
		return openSavedConversation(deps, {
			workspaceId: "workspace",
			conversationId: id,
			expectedRevision: revision(row),
			originalSessionExited: true,
		});
	};
	await write();
	return {
		directory,
		cwd,
		project,
		profile,
		sqlite,
		db,
		account,
		deps,
		launches,
		input,
		content,
		write,
		adopt,
		openSaved,
	};
}

async function rejected(operation: Promise<unknown>): Promise<unknown> {
	try {
		await operation;
	} catch (error) {
		return error;
	}
	throw new Error("Expected operation to reject");
}

describe("saved native Claude adoption", () => {
	test("lists metadata without accepting filename identity as proof", async () => {
		const f = await fixture();
		await writeFile(join(f.project, `${firstId}.jsonl`), "not jsonl");
		const page = await listSavedConversations(f.deps, f.input);
		expect(page.candidates[0]?.nativeSessionId).toBe(firstId);
		expect(page.candidates[0]).not.toHaveProperty("content");
		await expect(f.adopt()).rejects.toThrow();
		expect(f.launches).toHaveLength(0);
	});
	test("a profile without a projects store lists no saved conversations", async () => {
		const f = await fixture();
		await rm(join(f.profile, "projects"), { recursive: true });
		const page = await listSavedConversations(f.deps, f.input);
		expect(page.candidates).toEqual([]);
		expect(page.conversations).toEqual([]);
		expect(page.nextCursor).toBeNull();
		expect(f.launches).toHaveLength(0);
	});

	test("adopting a transcript removed after discovery gives a private precondition refusal", async () => {
		const f = await fixture();
		const candidate = (await listSavedConversations(f.deps, f.input))
			.candidates[0];
		if (!candidate) throw new Error("missing candidate");
		await rm(join(f.project, `${firstId}.jsonl`));
		const error = await rejected(
			adoptNativeConversation(f.deps, {
				...f.input,
				nativeSessionId: firstId,
				expectedRevision: candidate.revision,
			}),
		);
		expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(String(error)).not.toContain(f.profile);
		expect(f.launches).toHaveLength(0);
		expect(f.db.select().from(savedConversations).all()).toEqual([]);
	});

	test("paginates metadata with an explicit cursor", async () => {
		const f = await fixture();
		for (let index = 1; index <= 101; index++)
			await writeFile(
				join(
					f.project,
					`00000000-0000-4000-8000-${String(index).padStart(12, "0")}.jsonl`,
				),
				"",
			);
		const first = await listSavedConversations(f.deps, f.input);
		expect(first.candidates).toHaveLength(100);
		expect(first.nextCursor).not.toBeNull();
		const next = await listSavedConversations(f.deps, {
			...f.input,
			cursor: first.nextCursor as string,
		});
		expect(next.candidates).toHaveLength(2);
		expect(next.nextCursor).toBeNull();
		expect(
			new Set(
				[...first.candidates, ...next.candidates].map(
					(row) => row.nativeSessionId,
				),
			).size,
		).toBe(102);
	});
	test("adopts two chats from one folder independently and keeps one checkpoint each", async () => {
		const f = await fixture();
		await f.write(secondId);
		const first = await f.adopt();
		const repeated = await f.adopt();
		const second = await f.adopt(secondId);
		expect(repeated.id).toBe(first.id);
		expect(second.id).not.toBe(first.id);
		expect(f.db.select().from(workspaces).all()).toHaveLength(1);
		expect(await readdir(f.deps.checkpointDirectory)).toHaveLength(2);
		const checkpoint = join(f.deps.checkpointDirectory, `${first.id}.jsonl`);
		expect(await readFile(checkpoint, "utf8")).toBe(f.content(firstId));
		expect((await stat(checkpoint)).mode & 0o777).toBe(0o600);
		expect((await stat(f.deps.checkpointDirectory)).mode & 0o777).toBe(0o700);
	});
	test("opens using revisions returned by adoption, repeated adoption and listing", async () => {
		const f = await fixture();
		const open = (saved: { id: string; revision: string }) =>
			openSavedConversation(f.deps, {
				workspaceId: "workspace",
				conversationId: saved.id,
				expectedRevision: saved.revision,
				originalSessionExited: true,
			});
		const adopted = await f.adopt();
		const first = await open(adopted);
		const repeated = await f.adopt();
		expect((await open(repeated)).terminalId).toBe(first.terminalId);
		const page = await listSavedConversations(f.deps, f.input);
		const listed = page.conversations.find((saved) => saved.id === adopted.id);
		if (!listed) throw new Error("missing listed adoption");
		expect((await open(listed)).terminalId).toBe(first.terminalId);
		expect(f.launches).toHaveLength(1);
		expect(f.launches[0]?.resumeSessionId).toBe(firstId);
	});
	test("rejects a stale discovery revision", async () => {
		const f = await fixture();
		const page = await listSavedConversations(f.deps, f.input);
		await appendFile(join(f.project, `${firstId}.jsonl`), "\n");
		await expect(
			adoptNativeConversation(f.deps, {
				...f.input,
				nativeSessionId: firstId,
				expectedRevision: page.candidates[0]?.revision as string,
			}),
		).rejects.toThrow();
		expect(f.db.select().from(savedConversations).all()).toHaveLength(0);
	});
	test("refuses another main transcript copy in any Claude project", async () => {
		const f = await fixture();
		const duplicate = join(f.profile, "projects", "other");
		await mkdir(duplicate, { recursive: true });
		await writeFile(join(duplicate, `${firstId}.jsonl`), f.content(firstId));
		await expect(f.adopt()).rejects.toThrow("ambiguous");
	});
	test("does not follow a symlinked project directory or fall back to another profile", async () => {
		const f = await fixture();
		await rm(f.project, { recursive: true });
		const other = join(f.directory, "other-history");
		await mkdir(other);
		await writeFile(join(other, `${firstId}.jsonl`), f.content(firstId));
		await symlink(other, f.project);
		await expect(listSavedConversations(f.deps, f.input)).rejects.toThrow();
	});
	test("refuses a checkpoint directory readable by others", async () => {
		const f = await fixture();
		await mkdir(f.deps.checkpointDirectory);
		await chmod(f.deps.checkpointDirectory, 0o755);
		await expect(f.adopt()).rejects.toThrow("private history checkpoint");
		expect(await readdir(f.deps.checkpointDirectory)).toHaveLength(0);
	});
	test("rejects a changed native working folder", async () => {
		const f = await fixture();
		await writeFile(
			join(f.project, `${firstId}.jsonl`),
			f.content(firstId).replaceAll(f.cwd, `${f.cwd}-other`),
		);
		await expect(f.adopt()).rejects.toThrow();
	});
	test("keeps provenance immutable while reopening appended local history", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const before = f.db.select().from(savedConversations).get()?.provenanceJson;
		await appendFile(
			join(f.project, `${firstId}.jsonl`),
			`${JSON.stringify({ type: "assistant", sessionId: firstId, cwd: f.cwd, uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", message: { role: "assistant", content: "Continued locally after import" } })}\n`,
		);
		const opened = await f.openSaved(saved.id);
		expect(opened.state).toBe("bound");
		expect(f.launches[0]?.resumeSessionId).toBe(firstId);
		expect(f.launches[0]?.prompt).toBe("");
		expect(f.launches[0]?.surface).toBe("terminal");
		expect(f.db.select().from(savedConversations).get()?.provenanceJson).toBe(
			before,
		);
	});
	test("focuses an existing bound terminal without launching again", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const first = await f.openSaved(saved.id);
		const second = await f.openSaved(saved.id);
		expect(second.terminalId).toBe(first.terminalId);
		expect(f.launches).toHaveLength(1);
	});
	test("a host-store reload and ordinary hook preserve saved-account focus and reopening", async () => {
		const f = await fixture();
		f.deps.resolveAccount = async () => ({
			agent: f.account.agent,
			selection: f.account.selection,
			credentialKind: f.account.credentialKind,
			identity: f.account.identity,
			email: f.account.email,
			directory: f.account.directory,
			pinned: true,
		});
		const saved = await f.adopt();
		const first = await f.openSaved(saved.id);
		const reloaded = new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(f.db),
		);
		reloaded.recordEvent({
			terminalId: first.terminalId,
			workspaceId: "workspace",
			eventType: "Start",
			agentId: "claude",
			agentSessionId: firstId,
			occurredAt: 2,
		});
		const page = await listSavedConversations(f.deps, f.input);
		expect(page.conversations[0]?.canFocusExisting).toBe(true);
		expect((await f.openSaved(saved.id)).terminalId).toBe(first.terminalId);
		expect(f.launches).toHaveLength(1);
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: 3, endReason: "detached" })
			.where(eq(terminalAgentBindings.terminalId, first.terminalId))
			.run();
		expect((await f.openSaved(saved.id)).terminalId).not.toBe(first.terminalId);
		expect(f.launches).toHaveLength(2);
		expect(f.launches[1]?.resumeSessionId).toBe(firstId);
	});
	test("only new launches require exit confirmation", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const withoutConfirmation = () => {
			const row = f.db.select().from(savedConversations).get();
			return openSavedConversation(f.deps, {
				workspaceId: "workspace",
				conversationId: saved.id,
				expectedRevision: revision(row),
				originalSessionExited: false,
			});
		};
		await expect(withoutConfirmation()).rejects.toThrow("Exit the original");
		expect(f.launches).toHaveLength(0);
		const first = await f.openSaved(saved.id);
		await expect(withoutConfirmation()).resolves.toHaveProperty(
			"terminalId",
			first.terminalId,
		);
		expect(
			(await listSavedConversations(f.deps, f.input)).conversations[0]
				?.canFocusExisting,
		).toBe(true);
		expect(f.launches).toHaveLength(1);
	});
	test("an idle hint becoming stale cannot launch without exit confirmation", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		await f.openSaved(saved.id);
		const page = await listSavedConversations(f.deps, f.input);
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: 2, endReason: "detached" })
			.run();
		await expect(
			openSavedConversation(f.deps, {
				workspaceId: "workspace",
				conversationId: saved.id,
				expectedRevision: page.conversations[0]?.revision as string,
				originalSessionExited: false,
			}),
		).rejects.toThrow("Exit the original");
		expect(f.launches).toHaveLength(1);
	});
	test("closing a terminal row does not delete the saved conversation", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const first = await f.openSaved(saved.id);
		f.db
			.delete(terminalSessions)
			.where(eq(terminalSessions.id, first.terminalId))
			.run();
		expect(f.db.select().from(savedConversations).get()?.id).toBe(saved.id);
		const next = await f.openSaved(saved.id);
		expect(next.terminalId).not.toBe(first.terminalId);
		expect(f.launches).toHaveLength(2);
	});
	test("missing current history never falls back to its saved checkpoint", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		await rm(join(f.project, `${firstId}.jsonl`));
		await expect(f.openSaved(saved.id)).rejects.toThrow();
		expect(f.launches).toHaveLength(0);
		expect(await readdir(f.deps.checkpointDirectory)).toHaveLength(1);
	});
	test("a changed selected account fails without altering defaults or history", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		f.account.identity = "b".repeat(64);
		await expect(f.openSaved(saved.id)).rejects.toThrow("account changed");
		expect(f.launches).toHaveLength(0);
		expect(await readFile(join(f.project, `${firstId}.jsonl`), "utf8")).toBe(
			f.content(firstId),
		);
	});
	test("profile sign-out does not block navigation to a preserved exact terminal", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const first = await f.openSaved(saved.id);
		f.deps.resolveAccount = async () => unavailable("signed out");
		expect((await f.openSaved(saved.id)).terminalId).toBe(first.terminalId);
		expect(f.launches).toHaveLength(1);
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: 2, endReason: "detached" })
			.run();
		await expect(f.openSaved(saved.id)).rejects.toThrow("signed out");
		expect(f.launches).toHaveLength(1);
	});
	test("detects an external writer before launch", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		f.deps.assertNoWriter = async () => unavailable("known writer");
		await expect(f.openSaved(saved.id)).rejects.toThrow("known writer");
		expect(f.launches).toHaveLength(0);
	});
	test("a pending or active matching binding prevents another launch", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		f.db.insert(terminalSessions).values({ id: "other", createdAt: 1 }).run();
		f.db
			.insert(terminalAgentBindings)
			.values({
				terminalId: "other",
				workspaceId: "workspace",
				agentId: "claude",
				agentSessionId: firstId,
				startedAt: 1,
				lastEventAt: 1,
				lastEventType: "Attached",
			})
			.run();
		expect(await rejected(f.openSaved(saved.id))).toMatchObject({
			message: expect.stringContaining("already has"),
		});
		expect(f.launches).toHaveLength(0);
	});
	test("a failed preflight releases its claim and retains the adoption", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const launch = f.deps.runAgent;
		f.deps.runAgent = async (input) => {
			await appendFile(join(f.project, `${firstId}.jsonl`), "\n");
			return (launch as NonNullable<typeof launch>)(input);
		};
		expect(await rejected(f.openSaved(saved.id))).toBeInstanceOf(Error);
		expect(f.db.select().from(savedConversations).get()?.state).toBe("adopted");
		expect(f.db.select().from(terminalAgentBindings).all()).toHaveLength(0);
	});
	test("a lost response after authorization retains the terminal instead of retrying", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const launch = f.deps.runAgent;
		f.deps.runAgent = async (input) => {
			await (launch as NonNullable<typeof launch>)(input);
			throw new Error("lost response");
		};
		expect(await rejected(f.openSaved(saved.id))).toMatchObject({
			message: "lost response",
		});
		const second = await f.openSaved(saved.id);
		expect(second.state).toBe("bound");
		expect(f.launches).toHaveLength(1);
	});
	test("an interrupted pre-command claim without a binding can retry", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		f.db
			.update(savedConversations)
			.set({ state: "opening", terminalId: "unbound-old-shell" })
			.run();
		expect(await f.openSaved(saved.id)).toHaveProperty("state", "bound");
		expect(f.launches).toHaveLength(1);
	});
	test("an opening claim with a binding refuses an unsafe second launch", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		await f.openSaved(saved.id);
		f.db.update(savedConversations).set({ state: "opening" }).run();
		await expect(f.openSaved(saved.id)).rejects.toThrow("earlier launch");
		expect(f.launches).toHaveLength(1);
	});
	test("wrong observed native identity refuses instead of opening a different chat", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		await f.openSaved(saved.id);
		f.db.update(terminalAgentBindings).set({ agentSessionId: secondId }).run();
		await expect(f.openSaved(saved.id)).rejects.toThrow("no longer matches");
		expect(f.launches).toHaveLength(1);
	});
	test("two simultaneous opens cannot create duplicate terminals", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const results = await Promise.allSettled([
			f.openSaved(saved.id),
			f.openSaved(saved.id),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(f.launches).toHaveLength(1);
	});
	test("an authorization transaction rollback releases the opening claim", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		f.deps.runAgent = async (input) => {
			const launch = input.terminalLaunch;
			if (!launch) throw new Error("guard required");
			await launch.beforeInitialCommand();
			f.db.transaction(() => {
				f.db
					.insert(terminalSessions)
					.values({
						id: launch.terminalId,
						originWorkspaceId: "workspace",
						createdAt: 1,
					})
					.run();
				f.db
					.insert(terminalAgentBindings)
					.values({
						terminalId: launch.terminalId,
						workspaceId: "workspace",
						agentId: "claude",
						agentSessionId: firstId,
						accountJson: JSON.stringify(input.account),
						startedAt: 1,
						lastEventAt: 1,
						lastEventType: "Attached",
					})
					.run();
				launch.onInitialCommandReady();
				throw new Error("transaction rolled back");
			});
			throw new Error("unreachable");
		};
		expect(await rejected(f.openSaved(saved.id))).toMatchObject({
			message: "transaction rolled back",
		});
		expect(f.db.select().from(savedConversations).get()?.state).toBe("adopted");
		expect(f.db.select().from(terminalAgentBindings).all()).toHaveLength(0);
	});
	test("adopted terminals never take legacy auto-resume's fresh-chat fallback", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const opened = await f.openSaved(saved.id);
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: 2, endReason: "terminal-exited" })
			.run();
		const result = await resumeTerminalAgentSession(
			{ db: f.db } as Parameters<typeof resumeTerminalAgentSession>[0],
			{ workspaceId: "workspace", terminalId: opened.terminalId },
		);
		expect(result).toEqual({ resumed: false });
		expect(f.launches).toHaveLength(1);
	});
	test("account authorization rolls back its source binding when saved-lineage update fails", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const opened = await f.openSaved(saved.id);
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: 2, endReason: "terminal-exited" })
			.run();
		const previousBinding = f.db.select().from(terminalAgentBindings).get();
		const previousSaved = f.db.select().from(savedConversations).get();
		if (!previousBinding || !previousSaved)
			throw new Error("fixture source unavailable");
		const source = accountResumeSource(f.db, {
			workspaceId: "workspace",
			terminalId: opened.terminalId,
		});
		if (!source?.ready) throw new Error("fixture source unavailable");
		const targetProfile = join(f.directory, "target-profile");
		await mkdir(targetProfile);
		await symlink(join(f.profile, "projects"), join(targetProfile, "projects"));
		const target: SessionAccount = {
			...f.account,
			identity: "b".repeat(64),
			selection: targetProfile,
			directory: targetProfile,
		};
		f.sqlite.exec(
			`CREATE TRIGGER reject_lineage_update BEFORE UPDATE ON saved_conversations WHEN NEW.terminal_id <> OLD.terminal_id BEGIN SELECT RAISE(ABORT, 'synthetic lineage failure'); END;`,
		);
		await expect(
			resumeTerminalWithAccount(
				{
					db: f.db,
					runAgent: f.deps.runAgent as NonNullable<
						SavedConversationDeps["runAgent"]
					>,
					eventBus: { broadcastTerminalLifecycle: () => {} },
					resolveAccount: async () => target,
					validateRouting: async () => {},
					assertIdle: async () => {},
					assertNoClaudeWriter: async () => {},
				},
				{
					workspaceId: "workspace",
					terminalId: opened.terminalId,
					expectedRevision: source.revision,
					account: target,
				},
			),
		).rejects.toThrow();
		expect(f.db.select().from(terminalAgentBindings).all()).toEqual([
			previousBinding,
		]);
		expect(f.db.select().from(savedConversations).get()).toEqual(previousSaved);
		expect(f.db.select().from(terminalSessions).all()).toHaveLength(1);
	});

	test("explicit account recovery advances local lineage without changing import provenance", async () => {
		const f = await fixture();
		const saved = await f.adopt();
		const opened = await f.openSaved(saved.id);
		const provenance = f.db
			.select()
			.from(savedConversations)
			.get()?.provenanceJson;
		f.db
			.update(terminalAgentBindings)
			.set({ endedAt: 2, endReason: "terminal-exited" })
			.run();
		const source = accountResumeSource(f.db, {
			workspaceId: "workspace",
			terminalId: opened.terminalId,
		});
		if (!source?.ready) throw new Error("fixture source unavailable");
		const targetProfile = join(f.directory, "target-profile");
		await mkdir(targetProfile);
		await symlink(join(f.profile, "projects"), join(targetProfile, "projects"));
		const target: SessionAccount = {
			...f.account,
			identity: "b".repeat(64),
			selection: targetProfile,
			directory: targetProfile,
		};
		const result = await resumeTerminalWithAccount(
			{
				db: f.db,
				runAgent: f.deps.runAgent as NonNullable<
					SavedConversationDeps["runAgent"]
				>,
				eventBus: { broadcastTerminalLifecycle: () => {} },
				resolveAccount: async () => target,
				validateRouting: async () => {},
				assertIdle: async () => {},
				assertNoClaudeWriter: async () => {},
			},
			{
				workspaceId: "workspace",
				terminalId: opened.terminalId,
				expectedRevision: source.revision,
				account: target,
			},
		);
		const current = f.db.select().from(savedConversations).get();
		expect(current?.terminalId).toBe(result.terminalId);
		expect(current?.accountJson).toBe(JSON.stringify(target));
		expect(current?.provenanceJson).toBe(provenance);
		Object.assign(f.account, target);
		expect((await f.openSaved(saved.id)).terminalId).toBe(result.terminalId);
		expect(f.launches).toHaveLength(2);
	});
});
