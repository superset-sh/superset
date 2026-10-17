import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { terminalSessions } from "../../../db/schema";
import {
	assertAccountResumeTerminalIdle,
	assertNoRecordedClaudeWriter,
} from "./account-resume-processes";

const directories: string[] = [];
const databases: Database[] = [];
afterEach(async () => {
	for (const db of databases.splice(0)) db.close();
	await Promise.all(
		directories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});
const startedAt = "Fri Oct 9 10:00:00 2026";
async function writerFixture(
	record: unknown = {
		sessionId: "exact-id",
		pid: 123,
		procStart: startedAt,
		pidDomain: process.platform,
	},
) {
	const directory = await mkdtemp(
		join(tmpdir(), "superset-account-resume-process-"),
	);
	directories.push(directory);
	await mkdir(join(directory, "sessions"));
	await writeFile(join(directory, "sessions/123.json"), JSON.stringify(record));
	return { sessionId: "exact-id", directories: [directory], directory };
}
function terminalFixture() {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	db.insert(terminalSessions)
		.values({
			id: "source",
			status: "active",
			originWorkspaceId: "workspace",
			createdAt: 1,
		})
		.run();
	return db;
}

describe("known native writer detection", () => {
	test("rejects a process with matching native ID, PID and start identity", async () => {
		await expect(
			assertNoRecordedClaudeWriter(
				await writerFixture(),
				async () => new Map([[123, startedAt]]),
			),
		).rejects.toThrow("still open");
	});
	test("refuses a live matching PID when its birth timestamp cannot be compared", async () => {
		await expect(
			assertNoRecordedClaudeWriter(
				await writerFixture(),
				async () => new Map([[123, "Fri Oct 9 11:00:00 2026"]]),
			),
		).rejects.toThrow("still open");
	});
	test("accepts a dead recorded writer without deleting its registry record", async () => {
		const input = await writerFixture();
		await expect(
			assertNoRecordedClaudeWriter(input, async () => new Map()),
		).resolves.toBeUndefined();
		expect(
			(await stat(join(input.directory, "sessions/123.json"))).isFile(),
		).toBe(true);
	});
	test("ignores a different native conversation", async () => {
		const input = await writerFixture({
			sessionId: "different",
			pid: 123,
			procStart: startedAt,
			pidDomain: process.platform,
		});
		await expect(
			assertNoRecordedClaudeWriter(input, async (pids) => {
				expect(pids).toEqual([]);
				return new Map([[123, startedAt]]);
			}),
		).resolves.toBeUndefined();
	});
	test.each([
		null,
		{ sessionId: "exact-id", pid: 123 },
		{
			sessionId: "exact-id",
			pid: 456,
			procStart: startedAt,
			pidDomain: process.platform,
		},
	])("refuses malformed ownership evidence", async (record) => {
		await expect(
			assertNoRecordedClaudeWriter(
				await writerFixture(record),
				async () => new Map(),
			),
		).rejects.toThrow("exit could not be verified");
	});
	test("propagates a failed process inventory rather than treating it as empty", async () => {
		await expect(
			assertNoRecordedClaudeWriter(await writerFixture(), async () => {
				throw new Error("inventory failed");
			}),
		).rejects.toThrow("inventory failed");
	});
});

describe("source terminal remains intact", () => {
	test("allows an idle shell and leaves its session row unchanged", async () => {
		const db = terminalFixture();
		const before = db.select().from(terminalSessions).all();
		await expect(
			assertAccountResumeTerminalIdle(db, "source", "workspace", {
				listSessions: async () => [{ id: "source", pid: 12, alive: true }],
				foregroundGroups: async () => "12 12\n",
			}),
		).resolves.toBeUndefined();
		expect(db.select().from(terminalSessions).all()).toEqual(before);
	});
	test.each([
		"13 12",
		"-1 12",
		"garbage",
		"12",
		"",
	])("refuses non-idle or unavailable process groups: %s", async (groups) => {
		await expect(
			assertAccountResumeTerminalIdle(
				terminalFixture(),
				"source",
				"workspace",
				{
					listSessions: async () => [{ id: "source", pid: 12, alive: true }],
					foregroundGroups: async () => groups,
				},
			),
		).rejects.toThrow("exit could not be verified");
	});
	test("allows a missing daemon session only after a successful inventory", async () => {
		await expect(
			assertAccountResumeTerminalIdle(
				terminalFixture(),
				"source",
				"workspace",
				{
					listSessions: async () => [],
					foregroundGroups: async () => {
						throw new Error("must not inspect");
					},
				},
			),
		).resolves.toBeUndefined();
	});
	test("refuses an unavailable daemon inventory", async () => {
		await expect(
			assertAccountResumeTerminalIdle(
				terminalFixture(),
				"source",
				"workspace",
				{
					listSessions: async () => {
						throw new Error("offline");
					},
					foregroundGroups: async () => "12 12",
				},
			),
		).rejects.toThrow("exit could not be verified");
	});
	test("refuses a source that belongs to another workspace", async () => {
		await expect(
			assertAccountResumeTerminalIdle(
				terminalFixture(),
				"source",
				"wrong-workspace",
				{ listSessions: async () => [], foregroundGroups: async () => "12 12" },
			),
		).rejects.toThrow("exit could not be verified");
	});
});
