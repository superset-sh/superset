import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { agentMemoryRouter } from "./agent-memory";
import {
	AGENT_MEMORY_FILES,
	getAgentMemoryFile,
	sanitizeClaudeProjectDir,
} from "./registry";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const CONFIG_ID = "3c2f9d8f-5678-4abc-8def-0123456789ab";
const PROJECT_ID = "4d3f0e9f-6789-4abc-8def-0123456789ab";

let root: string;
let db: ReturnType<typeof drizzle<typeof schema>>;

function createCaller() {
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return agentMemoryRouter.createCaller(ctx);
}

function seedClaudeConfig(env: Record<string, string>): void {
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

function seedProject(repoPath: string, name = "Demo"): void {
	mkdirSync(repoPath, { recursive: true });
	db.insert(schema.projects).values({ id: PROJECT_ID, repoPath, name }).run();
}

function seedWorkspace(options: {
	id: string;
	worktreePath: string;
	name: string;
	projectId?: string | null;
	type?: "main" | "worktree" | "session";
}): void {
	mkdirSync(options.worktreePath, { recursive: true });
	db.insert(schema.workspaces)
		.values({
			id: options.id,
			projectId: options.projectId ?? null,
			worktreePath: options.worktreePath,
			branch: options.name,
			name: options.name,
			type: options.type ?? "worktree",
		})
		.run();
}

const WORKSPACE_ID = "5e4f1f0f-789a-4abc-8def-0123456789ab";
const SESSION_WS_ID = "6f5f2f1f-89ab-4abc-8def-0123456789ab";

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "agent-memory-router-test-"));
	const sqlite = new Database(":memory:");
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("registry", () => {
	it("resolves default config dirs under homeDir", () => {
		const home = "/home/u";
		const byPreset = Object.fromEntries(
			AGENT_MEMORY_FILES.map((entry) => [
				entry.presetId,
				join(entry.resolveConfigDir({}, home), entry.fileName),
			]),
		);
		expect(byPreset).toEqual({
			claude: "/home/u/.claude/CLAUDE.md",
			codex: "/home/u/.codex/AGENTS.md",
			gemini: "/home/u/.gemini/GEMINI.md",
			opencode: "/home/u/.config/opencode/AGENTS.md",
		});
	});

	it("sanitizes repo paths the way Claude Code names project dirs", () => {
		expect(sanitizeClaudeProjectDir("/Users/kietho/workplace/superset")).toBe(
			"-Users-kietho-workplace-superset",
		);
		expect(sanitizeClaudeProjectDir("/Users/k/.superset/x_y")).toBe(
			"-Users-k--superset-x-y",
		);
	});

	it("honors env overrides for claude, codex, and opencode", () => {
		expect(
			getAgentMemoryFile("claude")?.resolveConfigDir(
				{ CLAUDE_CONFIG_DIR: "/accounts/work" },
				"/home/u",
			),
		).toBe("/accounts/work");
		expect(
			getAgentMemoryFile("codex")?.resolveConfigDir(
				{ CODEX_HOME: "/accounts/codex" },
				"/home/u",
			),
		).toBe("/accounts/codex");
		expect(
			getAgentMemoryFile("opencode")?.resolveConfigDir(
				{ XDG_CONFIG_HOME: "/xdg" },
				"/home/u",
			),
		).toBe("/xdg/opencode");
	});
});

describe("agentMemory.get", () => {
	it("rejects an agent without a known memory file", async () => {
		expect(createCaller().get({ agent: "polygraph" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("returns exists:false with null content for a missing file", async () => {
		const configDir = join(root, "claude-home");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		const result = await createCaller().get({ agent: "claude" });
		expect(result).toMatchObject({
			presetId: "claude",
			fileName: "CLAUDE.md",
			path: join(configDir, "CLAUDE.md"),
			exists: false,
			content: null,
			revision: null,
		});
	});

	it("reads content and revision from the config-env dir", async () => {
		const configDir = join(root, "claude-home");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "CLAUDE.md"), "# memory\n");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });

		const result = await createCaller().get({ agent: "claude" });
		expect(result.exists).toBe(true);
		expect(result.content).toBe("# memory\n");
		expect(result.revision).toBeTruthy();
	});

	it("resolves a custom-config UUID through its presetId", async () => {
		const configDir = join(root, "claude-home");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "CLAUDE.md"), "via uuid");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });

		const result = await createCaller().get({ agent: CONFIG_ID });
		expect(result.content).toBe("via uuid");
	});
});

describe("agentMemory.write", () => {
	it("creates the file (and config dir) when expectedRevision is null", async () => {
		const configDir = join(root, "fresh-claude-home");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });

		const { revision } = await createCaller().write({
			agent: "claude",
			content: "first save",
			expectedRevision: null,
		});
		expect(readFileSync(join(configDir, "CLAUDE.md"), "utf-8")).toBe(
			"first save",
		);
		const reread = await createCaller().get({ agent: "claude" });
		expect(reread.revision).toBe(revision);
	});

	it("round-trips an edit against the loaded revision", async () => {
		const configDir = join(root, "claude-home");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		await createCaller().write({
			agent: "claude",
			content: "v1",
			expectedRevision: null,
		});
		const loaded = await createCaller().get({ agent: "claude" });

		await createCaller().write({
			agent: "claude",
			content: "v2",
			expectedRevision: loaded.revision,
		});
		expect(readFileSync(join(configDir, "CLAUDE.md"), "utf-8")).toBe("v2");
	});

	it("rejects a stale revision with CONFLICT and leaves the file alone", async () => {
		const configDir = join(root, "claude-home");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		await createCaller().write({
			agent: "claude",
			content: "mine",
			expectedRevision: null,
		});
		const loaded = await createCaller().get({ agent: "claude" });
		// Simulate the agent rewriting its memory behind the editor's back.
		writeFileSync(join(configDir, "CLAUDE.md"), "theirs");

		expect(
			createCaller().write({
				agent: "claude",
				content: "mine, edited",
				expectedRevision: loaded.revision,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(readFileSync(join(configDir, "CLAUDE.md"), "utf-8")).toBe("theirs");
	});

	it("rejects expectedRevision:null when the file now exists", async () => {
		const configDir = join(root, "claude-home");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "CLAUDE.md"), "already there");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });

		expect(
			createCaller().write({
				agent: "claude",
				content: "clobber",
				expectedRevision: null,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});

describe("agentMemory.listFiles", () => {
	it("lists global + project instruction file + auto-memory notes for claude", async () => {
		const configDir = join(root, "claude-home");
		const repoPath = join(root, "repo");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		seedProject(repoPath, "Demo");
		writeFileSync(join(repoPath, "CLAUDE.md"), "# project instructions");
		const memoryDir = join(
			configDir,
			"projects",
			sanitizeClaudeProjectDir(repoPath),
			"memory",
		);
		mkdirSync(memoryDir, { recursive: true });
		writeFileSync(join(memoryDir, "a-note.md"), "note");
		writeFileSync(join(memoryDir, "MEMORY.md"), "index");

		const files = await createCaller().listFiles({ agent: "claude" });
		expect(
			files.map((f) => [f.target.kind, f.fileName, f.projectName]),
		).toEqual([
			["global", "CLAUDE.md", null],
			["project", "CLAUDE.md", "Demo"],
			// MEMORY.md is pinned first within a project's auto-memory notes.
			["auto-memory", "MEMORY.md", "Demo"],
			["auto-memory", "a-note.md", "Demo"],
		]);
	});

	it("omits project rows whose instruction file doesn't exist", async () => {
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: join(root, "claude-home") });
		seedProject(join(root, "bare-repo"));
		const files = await createCaller().listFiles({ agent: "claude" });
		expect(files.map((f) => f.target.kind)).toEqual(["global"]);
	});
});

describe("project + auto-memory targets", () => {
	it("round-trips a project instruction file via the projects table path", async () => {
		const repoPath = join(root, "repo");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: join(root, "claude-home") });
		seedProject(repoPath);
		writeFileSync(join(repoPath, "CLAUDE.md"), "v1");

		const target = { kind: "project" as const, projectId: PROJECT_ID };
		const loaded = await createCaller().get({ agent: "claude", target });
		expect(loaded.content).toBe("v1");
		expect(loaded.path).toBe(join(repoPath, "CLAUDE.md"));

		await createCaller().write({
			agent: "claude",
			target,
			content: "v2",
			expectedRevision: loaded.revision,
		});
		expect(readFileSync(join(repoPath, "CLAUDE.md"), "utf-8")).toBe("v2");
	});

	it("round-trips an auto-memory note inside the derived memory dir", async () => {
		const configDir = join(root, "claude-home");
		const repoPath = join(root, "repo");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		seedProject(repoPath);

		const target = {
			kind: "auto-memory" as const,
			projectId: PROJECT_ID,
			fileName: "topic.md",
		};
		await createCaller().write({
			agent: "claude",
			target,
			content: "remembered",
			expectedRevision: null,
		});
		const expectedPath = join(
			configDir,
			"projects",
			sanitizeClaudeProjectDir(repoPath),
			"memory",
			"topic.md",
		);
		expect(readFileSync(expectedPath, "utf-8")).toBe("remembered");
		const reread = await createCaller().get({ agent: "claude", target });
		expect(reread.content).toBe("remembered");
	});

	it("rejects auto-memory file names that are not plain note names", async () => {
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: join(root, "claude-home") });
		seedProject(join(root, "repo"));
		for (const fileName of ["../evil.md", "a/b.md", ".hidden.md", "note.txt"]) {
			expect(
				createCaller().get({
					agent: "claude",
					target: { kind: "auto-memory", projectId: PROJECT_ID, fileName },
				}),
			).rejects.toThrow();
		}
	});

	it("rejects auto-memory targets for agents without a memory dir", async () => {
		seedProject(join(root, "repo"));
		expect(
			createCaller().get({
				agent: "codex",
				target: {
					kind: "auto-memory",
					projectId: PROJECT_ID,
					fileName: "topic.md",
				},
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("workspace scopes", () => {
	it("lists a worktree's instruction file only when it diverges from main", async () => {
		const configDir = join(root, "claude-home");
		const repoPath = join(root, "repo");
		const worktreePath = join(root, "wt");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		seedProject(repoPath, "Demo");
		seedWorkspace({
			id: WORKSPACE_ID,
			worktreePath,
			name: "feature-x",
			projectId: PROJECT_ID,
		});
		writeFileSync(join(repoPath, "CLAUDE.md"), "same");
		writeFileSync(join(worktreePath, "CLAUDE.md"), "same");

		const identical = await createCaller().listFiles({ agent: "claude" });
		expect(identical.some((f) => f.target.kind === "workspace")).toBe(false);

		writeFileSync(join(worktreePath, "CLAUDE.md"), "diverged");
		const diverged = await createCaller().listFiles({ agent: "claude" });
		const row = diverged.find((f) => f.target.kind === "workspace");
		expect(row).toMatchObject({
			fileName: "CLAUDE.md",
			projectName: "Demo",
			workspaceName: "feature-x",
			path: join(worktreePath, "CLAUDE.md"),
		});
	});

	it("lists a session workspace's files under its own group", async () => {
		const configDir = join(root, "claude-home");
		const sessionPath = join(root, "sessions", "certain-cap");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		seedWorkspace({
			id: SESSION_WS_ID,
			worktreePath: sessionPath,
			name: "Certain Cap",
			type: "session",
		});
		writeFileSync(join(sessionPath, "CLAUDE.md"), "session instructions");
		const memoryDir = join(
			configDir,
			"projects",
			sanitizeClaudeProjectDir(sessionPath),
			"memory",
		);
		mkdirSync(memoryDir, { recursive: true });
		writeFileSync(join(memoryDir, "MEMORY.md"), "index");

		const files = await createCaller().listFiles({ agent: "claude" });
		expect(
			files
				.filter((f) => f.workspaceId === SESSION_WS_ID)
				.map((f) => [f.target.kind, f.fileName, f.projectName]),
		).toEqual([
			["workspace", "CLAUDE.md", null],
			["workspace-auto-memory", "MEMORY.md", null],
		]);
	});

	it("skips workspace rows for the main checkout path", async () => {
		const repoPath = join(root, "repo");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: join(root, "claude-home") });
		seedProject(repoPath, "Demo");
		seedWorkspace({
			id: WORKSPACE_ID,
			worktreePath: repoPath,
			name: "main-dup",
			projectId: PROJECT_ID,
		});
		writeFileSync(join(repoPath, "CLAUDE.md"), "instructions");

		const files = await createCaller().listFiles({ agent: "claude" });
		expect(
			files.filter((f) => f.path === join(repoPath, "CLAUDE.md")).length,
		).toBe(1);
	});

	it("round-trips a workspace auto-memory note", async () => {
		const configDir = join(root, "claude-home");
		const worktreePath = join(root, "wt");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		seedWorkspace({
			id: WORKSPACE_ID,
			worktreePath,
			name: "feature-x",
		});

		const target = {
			kind: "workspace-auto-memory" as const,
			workspaceId: WORKSPACE_ID,
			fileName: "note.md",
		};
		await createCaller().write({
			agent: "claude",
			target,
			content: "worktree note",
			expectedRevision: null,
		});
		const expectedPath = join(
			configDir,
			"projects",
			sanitizeClaudeProjectDir(worktreePath),
			"memory",
			"note.md",
		);
		expect(readFileSync(expectedPath, "utf-8")).toBe("worktree note");
		const reread = await createCaller().get({ agent: "claude", target });
		expect(reread.content).toBe("worktree note");
	});

	it("rejects an unknown workspace with NOT_FOUND", async () => {
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: join(root, "claude-home") });
		expect(
			createCaller().get({
				agent: "claude",
				target: { kind: "workspace", workspaceId: WORKSPACE_ID },
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("agentMemory.list", () => {
	it("counts global + project + auto-memory files per agent", async () => {
		const configDir = join(root, "claude-home");
		const repoPath = join(root, "repo");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });
		seedProject(repoPath);
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "CLAUDE.md"), "global");
		writeFileSync(join(repoPath, "CLAUDE.md"), "project");
		const memoryDir = join(
			configDir,
			"projects",
			sanitizeClaudeProjectDir(repoPath),
			"memory",
		);
		mkdirSync(memoryDir, { recursive: true });
		writeFileSync(join(memoryDir, "MEMORY.md"), "index");
		writeFileSync(join(memoryDir, "note.md"), "note");

		const result = await createCaller().list();
		const claude = result.find((row) => row.presetId === "claude");
		expect(claude?.fileCount).toBe(4);
	});
	it("lists every registry agent with resolved paths and existence", async () => {
		const configDir = join(root, "claude-home");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "CLAUDE.md"), "hello");
		seedClaudeConfig({ CLAUDE_CONFIG_DIR: configDir });

		const result = await createCaller().list();
		expect(result.map((row) => row.presetId)).toEqual(
			AGENT_MEMORY_FILES.map((entry) => entry.presetId),
		);
		const claude = result.find((row) => row.presetId === "claude");
		expect(claude).toMatchObject({
			path: join(configDir, "CLAUDE.md"),
			exists: true,
			sizeBytes: 5,
		});
	});
});
