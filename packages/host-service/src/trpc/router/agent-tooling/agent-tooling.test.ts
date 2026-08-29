import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { agentToolingRouter } from "./agent-tooling";
import { clearSlashCommandDiscoveryCache } from "./discovery";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const WORKSPACE_ID = "2b1e8c7e-1234-4abc-8def-0123456789ab";
const CONFIG_ID = "3c2f9d8f-5678-4abc-8def-0123456789ab";

let root: string;
let worktree: string;
let db: ReturnType<typeof drizzle<typeof schema>>;
let previousSupersetHomeDir: string | undefined;

function createCaller() {
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return agentToolingRouter.createCaller(ctx);
}

function seedWorkspace(): void {
	db.insert(schema.workspaces)
		.values({
			id: WORKSPACE_ID,
			worktreePath: worktree,
			branch: "main",
			name: "test",
		})
		.run();
}

function seedAgentConfig(env: Record<string, string>): void {
	db.insert(schema.hostAgentConfigs)
		.values({
			id: CONFIG_ID,
			presetId: "claude",
			label: "Claude (work)",
			command: "claude",
			promptTransport: "argv",
			envJson: JSON.stringify(env),
			displayOrder: 0,
		})
		.run();
}

function writeCommand(configDir: string, name: string): void {
	mkdirSync(join(configDir, "commands"), { recursive: true });
	writeFileSync(
		join(configDir, "commands", `${name}.md`),
		`---\ndescription: ${name}\n---\n`,
	);
}

beforeEach(() => {
	previousSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
	root = mkdtempSync(join(tmpdir(), "agent-tooling-router-test-"));
	process.env.SUPERSET_HOME_DIR = root;
	worktree = join(root, "worktree");
	mkdirSync(worktree, { recursive: true });
	const sqlite = new Database(":memory:");
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	clearSlashCommandDiscoveryCache();
});

afterEach(() => {
	if (previousSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = previousSupersetHomeDir;
	}
	rmSync(root, { recursive: true, force: true });
	clearSlashCommandDiscoveryCache();
});

describe("agentTooling.listSlashCommands", () => {
	it("rejects an unknown workspace with NOT_FOUND", async () => {
		expect(
			createCaller().listSlashCommands({
				workspaceId: WORKSPACE_ID,
				agent: "claude",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("returns empty for an agent without discovery support", async () => {
		seedWorkspace();
		expect(
			await createCaller().listSlashCommands({
				workspaceId: WORKSPACE_ID,
				agent: "gemini",
			}),
		).toEqual([]);
	});

	it("reads the config dir from the agent config's env", async () => {
		seedWorkspace();
		const configDir = join(root, "work-account");
		writeCommand(configDir, "from-config-env");
		seedAgentConfig({ CLAUDE_CONFIG_DIR: configDir });

		const result = await createCaller().listSlashCommands({
			workspaceId: WORKSPACE_ID,
			agent: "claude",
		});
		expect(
			result.filter((c) => c.kind === "custom").map((c) => c.name),
		).toEqual(["from-config-env"]);
	});

	it("resolves a custom-config UUID through its presetId", async () => {
		seedWorkspace();
		const configDir = join(root, "uuid-account");
		writeCommand(configDir, "via-uuid");
		seedAgentConfig({ CLAUDE_CONFIG_DIR: configDir });

		const result = await createCaller().listSlashCommands({
			workspaceId: WORKSPACE_ID,
			agent: CONFIG_ID,
		});
		expect(
			result.filter((c) => c.kind === "custom").map((c) => c.name),
		).toEqual(["via-uuid"]);
	});

	it("falls back to the host default account, and config env wins over it", async () => {
		seedWorkspace();
		const accountDir = join(root, "default-account");
		const configDir = join(root, "pinned-account");
		writeCommand(accountDir, "from-default-account");
		writeCommand(configDir, "from-config-env");
		db.insert(schema.hostSettings)
			.values({ id: 1, defaultClaudeConfigDir: accountDir })
			.run();

		const fromAccount = await createCaller().listSlashCommands({
			workspaceId: WORKSPACE_ID,
			agent: "claude",
		});
		expect(
			fromAccount.filter((c) => c.kind === "custom").map((c) => c.name),
		).toEqual(["from-default-account"]);

		seedAgentConfig({ CLAUDE_CONFIG_DIR: configDir });
		clearSlashCommandDiscoveryCache();
		const fromConfig = await createCaller().listSlashCommands({
			workspaceId: WORKSPACE_ID,
			agent: "claude",
		});
		expect(
			fromConfig.filter((c) => c.kind === "custom").map((c) => c.name),
		).toEqual(["from-config-env"]);
	});
});
