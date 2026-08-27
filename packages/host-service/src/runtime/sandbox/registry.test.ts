import { Database as BunDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db/index.ts";
import * as schema from "../../db/schema.ts";
import { hostSettings, projects } from "../../db/schema.ts";
import { resolveSandboxEnabledForNewWorkspace } from "./registry.ts";

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../../drizzle");
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("resolveSandboxEnabledForNewWorkspace", () => {
	let repoDir: string;
	let db: HostDb;
	let sqlite: BunDatabase;

	const writeProjectConfig = (config: Record<string, unknown>) => {
		mkdirSync(path.join(repoDir, ".superset"), { recursive: true });
		writeFileSync(
			path.join(repoDir, ".superset", "config.json"),
			JSON.stringify(config),
		);
	};

	const setHostDefault = (enabled: boolean) => {
		db.insert(hostSettings)
			.values({ id: 1, sandboxNewWorkspaces: enabled })
			.onConflictDoUpdate({
				target: hostSettings.id,
				set: { sandboxNewWorkspaces: enabled },
			})
			.run();
	};

	beforeEach(() => {
		repoDir = mkdtempSync(path.join(tmpdir(), "superset-sbx-registry-"));
		sqlite = new BunDatabase(":memory:");
		const drizzleDb = drizzle(sqlite, { schema });
		migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });
		db = drizzleDb as unknown as HostDb;
		db.insert(projects)
			.values({
				id: PROJECT_ID,
				repoPath: repoDir,
				name: "sbx-test",
			})
			.run();
	});

	afterEach(() => {
		sqlite.close();
		rmSync(repoDir, { recursive: true, force: true });
	});

	test("defaults to host execution with no config and no host default", () => {
		expect(resolveSandboxEnabledForNewWorkspace(db, PROJECT_ID, repoDir)).toBe(
			false,
		);
	});

	test("host default sandboxes new workspaces when project config is silent", () => {
		setHostDefault(true);
		expect(resolveSandboxEnabledForNewWorkspace(db, PROJECT_ID, repoDir)).toBe(
			true,
		);
	});

	test("explicit project enabled=true wins without a host default", () => {
		writeProjectConfig({ sandbox: { enabled: true } });
		expect(resolveSandboxEnabledForNewWorkspace(db, PROJECT_ID, repoDir)).toBe(
			true,
		);
	});

	test("explicit project enabled=false overrides the host default", () => {
		setHostDefault(true);
		writeProjectConfig({ sandbox: { enabled: false } });
		expect(resolveSandboxEnabledForNewWorkspace(db, PROJECT_ID, repoDir)).toBe(
			false,
		);
	});

	test("unknown project resolves to host execution", () => {
		setHostDefault(true);
		expect(
			resolveSandboxEnabledForNewWorkspace(db, "does-not-exist", repoDir),
		).toBe(false);
	});
});
