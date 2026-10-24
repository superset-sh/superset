import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	describeProjectConfigSources,
	hasProjectConfig,
	type LegacyConfigSource,
	resolveScript,
} from "./config";

let root: string;
let repoPath: string;
let worktreePath: string;
let homeDir: string;
const projectId = "proj-1";

function write(dir: string, name: string, content: string) {
	mkdirSync(join(dir, ".superset"), { recursive: true });
	writeFileSync(join(dir, ".superset", name), content, "utf-8");
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "config-toml-test-"));
	repoPath = join(root, "repo");
	worktreePath = join(root, "worktree");
	homeDir = join(root, "home");
	for (const dir of [repoPath, worktreePath, homeDir]) {
		mkdirSync(dir, { recursive: true });
	}
	delete process.env.SUPERSET_HOST_RUN_MODE;
	delete process.env.IS_SANDBOX;
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	delete process.env.SUPERSET_HOST_RUN_MODE;
	delete process.env.IS_SANDBOX;
});

const args = () => ({ repoPath, projectId, worktreePath, homeDir });

describe("resolveScript with config.toml", () => {
	it("setup runs install then setup", () => {
		write(
			worktreePath,
			"config.toml",
			'[install]\nrun = "bun install"\n[setup]\nrun = ["./setup.sh"]\n',
		);
		expect(resolveScript("setup", args())).toEqual({
			kind: "commands",
			commands: ["bun install", "./setup.sh"],
		});
	});

	it("teardown runs archive, and run is the first default terminal", () => {
		write(
			worktreePath,
			"config.toml",
			'[archive]\nrun = ["./archive.sh"]\n[terminals.docs]\nrun = "bun docs"\n[terminals.dev]\nrun = "bun dev"\ndefault = true\ncwd = "apps/web"\n',
		);
		expect(resolveScript("teardown", args())).toEqual({
			kind: "commands",
			commands: ["./archive.sh"],
		});
		expect(resolveScript("run", args())).toEqual({
			kind: "commands",
			commands: ["bun dev"],
			cwd: "apps/web",
		});
	});

	it("wins over config.json and ignores the .sh fallback", () => {
		write(repoPath, "config.json", JSON.stringify({ setup: ["old"] }));
		write(repoPath, "teardown.sh", "echo old");
		write(worktreePath, "config.toml", '[setup]\nrun = "new"\n');
		expect(resolveScript("setup", args())).toMatchObject({
			commands: ["new"],
		});
		expect(resolveScript("teardown", args())).toBeNull();
	});

	it("falls back to the main checkout's config.toml", () => {
		write(repoPath, "config.toml", '[setup]\nrun = "from-main"\n');
		expect(resolveScript("setup", args())).toMatchObject({
			commands: ["from-main"],
		});
	});

	it("reads config.local.toml from the main checkout only", () => {
		write(worktreePath, "config.toml", '[setup]\nrun = "shared"\n');
		write(repoPath, "config.local.toml", '[setup]\nrun = ["shared", "mine"]\n');
		write(worktreePath, "config.local.toml", '[setup]\nrun = "ignored"\n');
		expect(resolveScript("setup", args())).toMatchObject({
			commands: ["shared", "mine"],
		});
	});

	it("different cwds give each command its own directory", () => {
		write(
			worktreePath,
			"config.toml",
			'[install]\nrun = "bun install"\n[setup]\nrun = "./setup.sh"\ncwd = "apps/web"\n',
		);
		const resolved = resolveScript("setup", args());
		expect(resolved).toEqual({
			kind: "commands",
			commands: [
				`(cd '${worktreePath}' && bun install)`,
				`(cd '${join(worktreePath, "apps/web")}' && ./setup.sh)`,
			],
		});
	});

	it("cloud boot runs the cloud setup then the default terminal, without the personal file", () => {
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		write(
			repoPath,
			"config.toml",
			'[setup]\nrun = "local-setup"\n[setup.cloud]\nrun = "cloud-setup"\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
		);
		write(repoPath, "config.local.toml", '[setup]\nrun = "personal"\n');
		expect(resolveScript("start", { repoPath, projectId })).toEqual({
			kind: "commands",
			commands: ["cloud-setup", "bun dev"],
		});
	});

	it("cloud boot stops setup at its first failure but still starts the terminal", () => {
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		write(
			repoPath,
			"config.toml",
			'[setup.cloud]\nrun = ["false", "touch ready"]\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
		);
		expect(resolveScript("start", { repoPath, projectId })).toEqual({
			kind: "commands",
			commands: ["false && touch ready", "bun dev"],
		});
	});

	it("a local app launched from a sandbox terminal still resolves as local", () => {
		process.env.IS_SANDBOX = "1";
		write(
			repoPath,
			"config.toml",
			'[terminals.dev]\nrun = "local-dev"\ndefault = true\n[terminals.dev.cloud]\nrun = "cloud-dev"\n',
		);
		expect(resolveScript("run", { repoPath, projectId })).toMatchObject({
			commands: ["local-dev"],
		});
	});

	it("an invalid file prints its errors for setup and skips archive", () => {
		write(worktreePath, "config.toml", '[setup]\nrun = "x"\ndefualt = 1\n');
		const setup = resolveScript("setup", args());
		expect(setup?.kind).toBe("commands");
		expect(setup?.kind === "commands" && setup.commands[0]).toContain(
			"defualt",
		);
		expect(
			setup?.kind === "commands" && setup.commands[0]?.endsWith("&& false"),
		).toBe(true);
		expect(resolveScript("teardown", args())).toBeNull();
	});
});

describe("hasProjectConfig and describeProjectConfigSources", () => {
	it("a config.toml counts as configured and reports no legacy sources", () => {
		write(repoPath, "config.toml", "");
		expect(hasProjectConfig({ repoPath, projectId, homeDir })).toBe(true);
		expect(describeProjectConfigSources(args())).toEqual({
			format: "toml",
			legacySources: [],
		});
	});

	it("reports the v1 features in use", () => {
		write(
			repoPath,
			"config.json",
			JSON.stringify({ setup: ["a"], start: ["b"] }),
		);
		write(
			repoPath,
			"config.local.json",
			JSON.stringify({ setup: { after: ["c"] } }),
		);
		write(repoPath, "teardown.sh", "echo");
		const userDir = join(homeDir, ".superset", "projects", projectId);
		mkdirSync(userDir, { recursive: true });
		writeFileSync(join(userDir, "config.json"), "{}");
		const expected: LegacyConfigSource[] = [
			"before_after",
			"cloud_start",
			"config_json",
			"config_local_json",
			"script_fallback",
			"user_projects_override",
		];
		expect(describeProjectConfigSources(args()).legacySources.sort()).toEqual(
			expected.sort(),
		);
	});

	it("nothing configured reports none", () => {
		expect(describeProjectConfigSources(args()).format).toBe("none");
		expect(hasProjectConfig({ repoPath, projectId, homeDir })).toBe(false);
	});
});
