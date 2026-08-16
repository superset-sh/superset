import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { workspacesRouter } from "../../workspaces/workspaces";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../../drizzle");
const CLAUDE_ID = "00000000-0000-0000-0000-00000000000a";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function seedClaude(db: HostDb) {
	db.insert(schema.hostAgentConfigs)
		.values({
			id: CLAUDE_ID,
			presetId: "claude",
			label: "Claude",
			command: "claude",
			argsJson: "[]",
			promptTransport: "argv",
			promptArgsJson: "[]",
			resumeArgsJson: "[]",
			envJson: "{}",
			capabilityRevision: 1,
			displayOrder: 0,
		})
		.run();
}

function createCaller(db: HostDb) {
	const ctx = {
		db,
		isAuthenticated: true,
		organizationId: "org-1",
	} as HostServiceContext;
	return workspacesRouter.createCaller(ctx);
}

describe("createSession launch contract", () => {
	it("returns an existing session before revalidating a retired model", async () => {
		const db = createTestDb();
		seedClaude(db);
		db.insert(schema.workspaces)
			.values({
				id: SESSION_ID,
				worktreePath: "/tmp/existing-session",
				branch: "main",
				name: "Existing session",
				type: "session",
			})
			.run();

		const result = await createCaller(db).createSession({
			id: SESSION_ID,
			agents: [
				{
					agent: "claude",
					prompt: "do the thing",
					model: "retired-model",
				},
			],
		});

		expect(result.workspace.id).toBe(SESSION_ID);
		expect(result.workspace.name).toBe("Existing session");
		expect(result.terminals).toEqual([]);
		expect(result.agents).toEqual([]);
	});

	it("rejects a retired model before creating a session folder", async () => {
		const db = createTestDb();
		seedClaude(db);
		const caller = createCaller(db);
		try {
			await caller.createSession({
				agents: [
					{
						agent: "claude",
						prompt: "do the thing",
						model: "retired-model",
					},
				],
			});
			throw new Error("Expected createSession to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
		}
		expect(db.select().from(schema.workspaces).all()).toEqual([]);
	});
});
