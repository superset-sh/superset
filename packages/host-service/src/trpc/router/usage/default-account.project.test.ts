import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import {
	getProjectDefaultAccountOverrides,
	resolveDefaultAccountEnv,
	resolveDefaultAccountTerminalEnv,
	setProjectDefaultAccountOverride,
	syncProjectDefaultAccountPointers,
} from "./default-account";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const PROJECT_ID = "6f0c2c3a-1111-4abc-8def-0123456789ab";
const WORKSPACE_ID = "2b1e8c7e-2222-4abc-8def-0123456789ab";
const SESSION_ID = "9d4a1b2c-3333-4abc-8def-0123456789ab";

let root: string;
let hostAccount: string;
let projectAccount: string;
let db: ReturnType<typeof drizzle<typeof schema>>;
let previousSupersetHomeDir: string | undefined;

beforeEach(() => {
	previousSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
	root = mkdtempSync(join(tmpdir(), "default-account-project-"));
	process.env.SUPERSET_HOME_DIR = join(root, "superset");
	hostAccount = join(root, "claude-personal");
	projectAccount = join(root, "claude-work");
	mkdirSync(hostAccount);
	mkdirSync(projectAccount);
	db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(schema.hostSettings)
		.values({ id: 1, defaultClaudeConfigDir: hostAccount })
		.run();
	db.insert(schema.projects)
		.values({ id: PROJECT_ID, repoPath: join(root, "repo"), name: "repo" })
		.run();
	db.insert(schema.workspaces)
		.values({
			id: WORKSPACE_ID,
			projectId: PROJECT_ID,
			worktreePath: join(root, "wt"),
			branch: "main",
			name: "wt",
		})
		.run();
	db.insert(schema.workspaces)
		.values({
			id: SESSION_ID,
			projectId: null,
			worktreePath: join(root, "session"),
			branch: "main",
			name: "session",
			type: "session",
		})
		.run();
});

afterEach(() => {
	if (previousSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = previousSupersetHomeDir;
	}
	rmSync(root, { recursive: true, force: true });
});

function projectPointer(): string {
	return join(
		root,
		"superset",
		"state",
		"projects",
		PROJECT_ID,
		"default-claude-config-dir",
	);
}

describe("per-project default account", () => {
	it("falls back to the host default when the project has no override", () => {
		expect(
			resolveDefaultAccountEnv(db, "claude", { projectId: PROJECT_ID })
				.CLAUDE_CONFIG_DIR,
		).toBe(hostAccount);
		expect(getProjectDefaultAccountOverrides(db, PROJECT_ID)).toEqual({
			claude: null,
			codex: null,
		});
	});

	it("prefers the project's profile over the host default", () => {
		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", {
			selection: projectAccount,
		});
		expect(
			resolveDefaultAccountEnv(db, "claude", { projectId: PROJECT_ID }),
		).toEqual({
			CLAUDE_CONFIG_DIR: projectAccount,
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: projectAccount,
		});
		// Other projects and the host itself are untouched.
		expect(resolveDefaultAccountEnv(db, "claude").CLAUDE_CONFIG_DIR).toBe(
			hostAccount,
		);
	});

	it("resolves a workspace to its project", () => {
		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", {
			selection: projectAccount,
		});
		expect(
			resolveDefaultAccountEnv(db, "claude", { workspaceId: WORKSPACE_ID })
				.CLAUDE_CONFIG_DIR,
		).toBe(projectAccount);
		expect(
			resolveDefaultAccountTerminalEnv(db, { workspaceId: WORKSPACE_ID })
				.CLAUDE_CONFIG_DIR,
		).toBe(projectAccount);
	});

	it("keeps sessions on the host default", () => {
		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", {
			selection: projectAccount,
		});
		expect(
			resolveDefaultAccountEnv(db, "claude", { workspaceId: SESSION_ID })
				.CLAUDE_CONFIG_DIR,
		).toBe(hostAccount);
	});

	it("can pin a project to the system-default login", () => {
		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", {
			selection: null,
		});
		expect(
			resolveDefaultAccountEnv(db, "claude", { projectId: PROJECT_ID }),
		).toEqual({});
		expect(getProjectDefaultAccountOverrides(db, PROJECT_ID).claude).toEqual({
			selection: null,
		});
		expect(readFileSync(projectPointer(), "utf8")).toBe("");
	});

	it("publishes and clears the project pointer the wrappers read", () => {
		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", {
			selection: projectAccount,
		});
		expect(readFileSync(projectPointer(), "utf8")).toBe(projectAccount);

		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", null);
		expect(existsSync(projectPointer())).toBe(false);
		expect(
			resolveDefaultAccountEnv(db, "claude", { projectId: PROJECT_ID })
				.CLAUDE_CONFIG_DIR,
		).toBe(hostAccount);
	});

	it("skips an override whose profile dir has vanished", () => {
		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", {
			selection: projectAccount,
		});
		rmSync(projectAccount, { recursive: true });
		expect(
			resolveDefaultAccountEnv(db, "claude", { projectId: PROJECT_ID }),
		).toEqual({});
	});

	it("reports an unknown project as not updated", () => {
		expect(
			setProjectDefaultAccountOverride(
				db,
				"00000000-0000-4000-8000-000000000000",
				"claude",
				{ selection: projectAccount },
			),
		).toBe(false);
	});

	it("republishes project pointers from the DB at boot", () => {
		setProjectDefaultAccountOverride(db, PROJECT_ID, "claude", {
			selection: projectAccount,
		});
		rmSync(join(root, "superset", "state"), { recursive: true, force: true });

		syncProjectDefaultAccountPointers(db);

		expect(readFileSync(projectPointer(), "utf8")).toBe(projectAccount);
	});
});
