import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../../db";
import { claudeFolderTrust } from "./claude-trust";
import { codexFolderTrust } from "./codex-trust";
import {
	findCarriedFolderTrust,
	prepareFolderTrust,
	resolveFolderTrustProvider,
} from "./folder-trust";
import type { FolderTrustDecision, FolderTrustProvider } from "./types";

let dir: string;
let previousSupersetHome: string | undefined;

beforeEach(() => {
	dir = realpathSync(mkdtempSync(join(tmpdir(), "folder-trust-")));
	previousSupersetHome = process.env.SUPERSET_HOME_DIR;
	process.env.SUPERSET_HOME_DIR = join(dir, "superset-home");
});

afterEach(() => {
	if (previousSupersetHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousSupersetHome;
	rmSync(dir, { recursive: true, force: true });
});

function mockDb(options: {
	defaultClaudeConfigDir?: string;
	repoPath?: string;
}): HostDb {
	return {
		select: () => ({
			from: () => ({
				get: () => ({
					defaultClaudeConfigDir: options.defaultClaudeConfigDir ?? null,
					defaultCodexHome: null,
				}),
				where: () => ({
					get: () =>
						options.repoPath ? { repoPath: options.repoPath } : undefined,
				}),
			}),
		}),
	} as unknown as HostDb;
}

function trustedState(...folders: string[]): string {
	return JSON.stringify({
		oauthAccount: { emailAddress: "someone@example.com" },
		projects: Object.fromEntries(
			folders.map((folder) => [folder, { hasTrustDialogAccepted: true }]),
		),
	});
}

function readProjects(file: string): Record<string, unknown> {
	return JSON.parse(readFileSync(file, "utf-8")).projects ?? {};
}

describe("resolveFolderTrustProvider", () => {
	test("matches by preset id", () => {
		expect(
			resolveFolderTrustProvider({ presetId: "claude", command: "claude" }),
		).toBe(claudeFolderTrust);
		expect(
			resolveFolderTrustProvider({ presetId: "codex", command: "codex" }),
		).toBe(codexFolderTrust);
	});

	test("matches custom presets by launch executable", () => {
		expect(
			resolveFolderTrustProvider({
				presetId: "custom-abc",
				command: "/usr/local/bin/claude --verbose",
			}),
		).toBe(claudeFolderTrust);
		expect(
			resolveFolderTrustProvider({
				presetId: "custom-def",
				command: "C:\\tools\\codex.exe",
			}),
		).toBe(codexFolderTrust);
	});

	test("returns null for agents without a known trust store", () => {
		expect(
			resolveFolderTrustProvider({ presetId: "gemini", command: "gemini" }),
		).toBe(null);
		expect(
			resolveFolderTrustProvider({
				presetId: "custom-xyz",
				command: "my-agent",
			}),
		).toBe(null);
	});
});

describe("prepareFolderTrust with Claude", () => {
	let personalStore: string;
	let workDir: string;
	let workStore: string;
	let repo: string;
	let worktree: string;
	let scans: number;
	let providers: FolderTrustProvider[];
	const workAgent = () => ({
		presetId: "claude",
		command: "claude",
		env: { CLAUDE_CONFIG_DIR: workDir },
	});

	beforeEach(() => {
		personalStore = join(dir, "personal.claude.json");
		workDir = join(dir, "claude-work");
		workStore = join(workDir, ".claude.json");
		repo = join(dir, "email-triage");
		worktree = join(dir, "worktrees", "email-triage-feature");
		for (const folder of [workDir, repo, worktree]) {
			mkdirSync(folder, { recursive: true });
		}
		writeFileSync(workStore, trustedState());
		scans = 0;
		providers = [
			{
				...claudeFolderTrust,
				discoverStoreFiles: async () => {
					scans += 1;
					return [personalStore, workStore];
				},
			},
		];
	});

	test("project workspace on the project's own checkout inherits trust accepted under another account", async () => {
		writeFileSync(personalStore, trustedState(repo));
		const args = await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(args).toEqual([]);
		expect(readProjects(workStore)).toEqual({
			[repo]: { hasTrustDialogAccepted: true },
		});
		expect(JSON.parse(readFileSync(workStore, "utf-8")).oauthAccount).toEqual({
			emailAddress: "someone@example.com",
		});
	});

	test("host-resumed launch, with no per-agent env, targets the selected default account", async () => {
		writeFileSync(personalStore, trustedState(repo));
		await prepareFolderTrust(
			mockDb({ defaultClaudeConfigDir: workDir, repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			{ presetId: "claude", command: "claude", env: {} },
			providers,
		);
		expect(readProjects(workStore)).toEqual({
			[repo]: { hasTrustDialogAccepted: true },
		});
	});

	test("worktree workspace inherits the main checkout's trust, keyed on the main checkout", async () => {
		writeFileSync(personalStore, trustedState(repo));
		await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: worktree, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(readProjects(workStore)).toEqual({
			[repo]: { hasTrustDialogAccepted: true },
		});
	});

	test("project folder no account has accepted is left to the dialog", async () => {
		writeFileSync(personalStore, trustedState(join(dir, "elsewhere")));
		const before = readFileSync(workStore, "utf-8");
		await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(readFileSync(workStore, "utf-8")).toBe(before);
	});

	test("already-trusted target is a no-op that never scans for other accounts", async () => {
		writeFileSync(workStore, trustedState(repo));
		const before = readFileSync(workStore, "utf-8");
		await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: worktree, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(scans).toBe(0);
		expect(readFileSync(workStore, "utf-8")).toBe(before);
	});

	test("corrupt target state file is left untouched", async () => {
		writeFileSync(personalStore, trustedState(repo));
		writeFileSync(workStore, "{not json");
		const args = await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(args).toEqual([]);
		expect(readFileSync(workStore, "utf-8")).toBe("{not json");
	});

	test("corrupt source state file is not evidence of trust", async () => {
		writeFileSync(
			personalStore,
			`{"projects":{"${repo}":{"hasTrustDialogAccepted":true}`,
		);
		const before = readFileSync(workStore, "utf-8");
		await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(readFileSync(workStore, "utf-8")).toBe(before);
	});

	test("session workspace is seeded outright without consulting other accounts", async () => {
		const session = join(dir, "session");
		mkdirSync(session);
		await prepareFolderTrust(
			mockDb({}),
			{ worktreePath: session, projectId: null },
			workAgent(),
			providers,
		);
		expect(scans).toBe(0);
		expect(readProjects(workStore)).toEqual({
			[session]: { hasTrustDialogAccepted: true },
		});
	});
});

describe("prepareFolderTrust with Codex", () => {
	let personalConfig: string;
	let workHome: string;
	let workConfig: string;
	let repo: string;
	let providers: FolderTrustProvider[];
	const workAgent = () => ({
		presetId: "codex",
		command: "codex",
		env: { CODEX_HOME: workHome },
	});

	beforeEach(() => {
		const personalHome = join(dir, "codex");
		workHome = join(dir, "codex-work");
		repo = join(dir, "email-triage");
		for (const folder of [personalHome, workHome, repo]) mkdirSync(folder);
		personalConfig = join(personalHome, "config.toml");
		workConfig = join(workHome, "config.toml");
		writeFileSync(
			personalConfig,
			`model = "gpt-5"\n\n[projects."${repo}"]\ntrust_level = "trusted"\n`,
		);
		providers = [
			{
				...codexFolderTrust,
				discoverStoreFiles: async () => [personalConfig, workConfig],
			},
		];
	});

	test("carried trust becomes a per-launch override and the config is never written", async () => {
		writeFileSync(workConfig, 'model = "gpt-5"\n');
		const args = await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(args).toEqual([
			"-c",
			`projects={"${repo}"={trust_level="trusted"}}`,
		]);
		expect(readFileSync(workConfig, "utf-8")).toBe('model = "gpt-5"\n');
	});

	test("an explicit untrusted entry in the launching account is never overridden", async () => {
		const declined = `[projects."${repo}"]\ntrust_level = "untrusted"\n`;
		writeFileSync(workConfig, declined);
		const args = await prepareFolderTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			workAgent(),
			providers,
		);
		expect(args).toEqual([]);
		expect(readFileSync(workConfig, "utf-8")).toBe(declined);
	});

	test("session workspace is persisted so later hand-typed launches do not prompt", async () => {
		const session = join(dir, "session");
		mkdirSync(session);
		const args = await prepareFolderTrust(
			mockDb({}),
			{ worktreePath: session, projectId: null },
			workAgent(),
			providers,
		);
		expect(args).toEqual([]);
		expect(readFileSync(workConfig, "utf-8")).toBe(
			`[projects."${session}"]\ntrust_level = "trusted"\n`,
		);
	});
});

describe("a newly registered provider", () => {
	test("gets the same policy with no changes outside its own definition", async () => {
		const decisions: Record<string, Record<string, FolderTrustDecision>> = {
			"/accounts/a": { "/repo": "trusted" },
			"/accounts/b": {},
		};
		const persisted: string[] = [];
		const fake: FolderTrustProvider = {
			family: "newcli",
			storeFile: (env) => env.NEWCLI_HOME ?? "/accounts/a",
			discoverStoreFiles: async () => Object.keys(decisions),
			readDecision: async (store, folder) =>
				decisions[store]?.[folder] ?? "none",
			persist: async (store, folder) => {
				persisted.push(`${store}:${folder}`);
			},
		};
		const args = await prepareFolderTrust(
			mockDb({ repoPath: "/repo" }),
			{ worktreePath: "/repo", projectId: "project-1" },
			{
				presetId: "custom",
				command: "/opt/bin/newcli --fast",
				env: { NEWCLI_HOME: "/accounts/b" },
			},
			[fake],
		);
		expect(args).toEqual([]);
		expect(persisted).toEqual(["/accounts/b:/repo"]);
	});
});

describe("findCarriedFolderTrust", () => {
	test("never reads the launching account as its own evidence", async () => {
		const carried = await findCarriedFolderTrust(
			{
				discoverStoreFiles: async () => ["/target"],
				readDecision: async () => "none",
			},
			"/target",
			["/repo"],
		);
		expect(carried).toEqual([]);
	});
});
