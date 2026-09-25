import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { terminalHarnessSession } from "./harness-session-ref";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function seed(db: HostDb, config: { presetId: string; envJson: string }) {
	db.insert(schema.workspaces)
		.values({
			id: "ws-1",
			worktreePath: "/work/tree",
			branch: "main",
			name: "fixture",
		})
		.run();
	db.insert(schema.terminalSessions)
		.values({ id: "t-1", originWorkspaceId: "ws-1", createdAt: 1 })
		.run();
	db.insert(schema.hostAgentConfigs)
		.values({
			id: "config-1",
			presetId: config.presetId,
			label: "Mine",
			command: "claude",
			argsJson: "[]",
			promptTransport: "argv",
			promptArgsJson: "[]",
			resumeArgsJson: "[]",
			forkArgsJson: "[]",
			envJson: config.envJson,
			displayOrder: 0,
		})
		.run();
	db.insert(schema.terminalAgentBindings)
		.values({
			terminalId: "t-1",
			workspaceId: "ws-1",
			agentId: "claude",
			agentSessionId: "s-1",
			definitionId: "config-1" as never,
			startedAt: 1,
			lastEventAt: 1,
			lastEventType: "Start",
			transcriptPath: "/home/a/.claude/projects/x/s-1.jsonl",
		})
		.run();
}

describe("terminalHarnessSession", () => {
	it("names the harness that wrote the session, not the config's preset", () => {
		const db = createTestDb();
		seed(db, {
			presetId: "custom",
			envJson: JSON.stringify({ CLAUDE_CONFIG_DIR: "/home/a/.claude-work" }),
		});

		expect(terminalHarnessSession(db, "t-1")).toEqual({
			ref: {
				agentId: "claude",
				sessionId: "s-1",
				worktreePath: "/work/tree",
				reportedPath: "/home/a/.claude/projects/x/s-1.jsonl",
				env: { CLAUDE_CONFIG_DIR: "/home/a/.claude-work" },
			},
			endedAt: null,
		});
	});

	it("answers nothing for a terminal with no bound agent", () => {
		expect(terminalHarnessSession(createTestDb(), "t-missing")).toBeNull();
	});
});
