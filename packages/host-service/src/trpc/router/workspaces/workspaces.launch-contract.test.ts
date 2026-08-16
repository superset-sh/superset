import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { buildValidatedTerminalAgentLaunch } from "../agents";
import { workspacesRouter } from "./workspaces";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const CLAUDE_ID = "00000000-0000-0000-0000-00000000000a";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

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

describe("workspaces launch contract", () => {
	it("rejects create before project or filesystem work when the model is retired", async () => {
		const db = createTestDb();
		seedClaude(db);
		const caller = createCaller(db);
		try {
			await caller.create({
				projectId: PROJECT_ID,
				agents: [
					{
						agent: "claude",
						prompt: "do the thing",
						model: "retired-model",
					},
				],
			});
			throw new Error("Expected create to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
		}
		expect(db.select().from(schema.workspaces).all()).toEqual([]);
	});

	it("rejects createEnqueued before enqueueing when the model is retired", async () => {
		const db = createTestDb();
		seedClaude(db);
		const caller = createCaller(db);
		try {
			await caller.createEnqueued({
				id: "22222222-2222-4222-8222-222222222222",
				projectId: PROJECT_ID,
				agents: [
					{
						agent: "claude",
						prompt: "do the thing",
						model: "retired-model",
					},
				],
			});
			throw new Error("Expected createEnqueued to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
		}
		expect(db.select().from(schema.workspaces).all()).toEqual([]);
	});

	it("preserves launch traits through the workspace-create schema", async () => {
		const db = createTestDb();
		seedClaude(db);
		const caller = createCaller(db);
		try {
			await caller.create({
				projectId: PROJECT_ID,
				agents: [
					{
						agent: "claude",
						prompt: "do the thing",
						model: "claude-opus-5",
						speed: "turbo",
					},
				],
			});
			throw new Error("Expected create to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as Error).message).toContain(
				'Unsupported speed "turbo" for Claude',
			);
		}
		expect(db.select().from(schema.workspaces).all()).toEqual([]);
	});

	it("setup-terminal chaining preserves the exact validated model", async () => {
		const db = createTestDb();
		seedClaude(db);
		const launch = await buildValidatedTerminalAgentLaunch(db, {
			workspaceId: "33333333-3333-4333-8333-333333333333",
			agent: "claude",
			prompt: "do the thing",
			model: "claude-opus-5",
			effort: "ultracode",
			speed: "fast",
			contextWindow: "1m",
		});
		expect(launch.fullCommand).toContain("'--model' 'claude-opus-5[1m]'");
		expect(launch.fullCommand).toContain("'--effort' 'xhigh'");
		expect(launch.fullCommand).toContain(
			'\'{"fastMode":true,"ultracode":true}\'',
		);
		expect(launch.fullCommand).not.toContain("claude-fable-5");
	});
});
