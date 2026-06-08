import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyTrellisSetup,
	canRunNodeEntrypoint,
	getTrellisStatusAtPath,
	resolveTrellisPlatformsFromAgents,
	type TrellisCommandArgs,
} from "./trellis";

async function tempRepo() {
	return mkdtemp(join(tmpdir(), "superset-trellis-"));
}

describe("getTrellisStatusAtPath", () => {
	test("reports missing when .trellis does not exist", async () => {
		const repoPath = await tempRepo();

		const status = await getTrellisStatusAtPath(repoPath);

		expect(status.state).toBe("missing");
		expect(status.hasTrellis).toBe(false);
		expect(status.configPath).toBeNull();
	});

	test("reports ready when config and tasks exist", async () => {
		const repoPath = await tempRepo();
		const trellisDir = join(repoPath, ".trellis");
		await mkdir(join(trellisDir, "tasks"), { recursive: true });
		await writeFile(join(trellisDir, "config.yaml"), "default_package: app\n");
		await writeFile(join(trellisDir, ".version"), "0.6.0-beta.21\n");

		const status = await getTrellisStatusAtPath(repoPath);

		expect(status.state).toBe("ready");
		expect(status.hasTrellis).toBe(true);
		expect(status.version).toBe("0.6.0-beta.21");
		expect(status.configPath).toBe(join(trellisDir, "config.yaml"));
	});

	test("reports partial when .trellis exists but required files are missing", async () => {
		const repoPath = await tempRepo();
		await mkdir(join(repoPath, ".trellis"), { recursive: true });

		const status = await getTrellisStatusAtPath(repoPath);

		expect(status.state).toBe("partial");
		expect(status.hasTrellis).toBe(true);
		expect(status.configPath).toBeNull();
	});
});

describe("applyTrellisSetup", () => {
	test("maps selected task agents to matching Trellis platform adapters only", () => {
		expect(resolveTrellisPlatformsFromAgents(["claude"])).toEqual(["claude"]);
		expect(resolveTrellisPlatformsFromAgents(["codex"])).toEqual(["codex"]);
		expect(resolveTrellisPlatformsFromAgents(["opencode"])).toEqual([
			"opencode",
		]);
		expect(resolveTrellisPlatformsFromAgents(["cursor-agent"])).toEqual([
			"cursor",
		]);
		expect(resolveTrellisPlatformsFromAgents(["gemini"])).toEqual(["gemini"]);
		expect(resolveTrellisPlatformsFromAgents(["pi"])).toEqual(["pi"]);
		expect(resolveTrellisPlatformsFromAgents(["copilot"])).toEqual(["copilot"]);
		expect(resolveTrellisPlatformsFromAgents(["droid"])).toEqual(["droid"]);
		expect(resolveTrellisPlatformsFromAgents(["mastracode"])).toEqual([]);
		expect(resolveTrellisPlatformsFromAgents(["superset"])).toEqual([]);
		expect(resolveTrellisPlatformsFromAgents(undefined)).toEqual([]);
		expect(resolveTrellisPlatformsFromAgents(["my-claude-wrapper"])).toEqual(
			[],
		);
	});

	test("does not treat Electron as a runtime for Trellis bin scripts", () => {
		expect(
			canRunNodeEntrypoint(
				"/Applications/Electron.app/Contents/MacOS/Electron",
			),
		).toBe(false);
		expect(
			canRunNodeEntrypoint(
				"/Users/bichengyu/Documents/toolProject/superset/node_modules/.bun/electron@40.8.5/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
			),
		).toBe(false);
		expect(canRunNodeEntrypoint("/usr/local/bin/node")).toBe(true);
		expect(canRunNodeEntrypoint("/Users/bichengyu/.bun/bin/bun")).toBe(true);
	});

	test("does nothing when initialization is not requested", async () => {
		const repoPath = await tempRepo();
		const calls: TrellisCommandArgs[] = [];

		const result = await applyTrellisSetup({
			worktreePath: repoPath,
			initialize: false,
			runner: async (args) => {
				calls.push(args);
				return { stdout: "", stderr: "" };
			},
			trellisBinPath: "/tmp/trellis.js",
		});

		expect(result.initialized).toBe(false);
		expect(result.state).toBe("missing");
		expect(calls).toHaveLength(0);
	});

	test("runs local Trellis init with the selected platform only", async () => {
		const repoPath = await tempRepo();
		const calls: TrellisCommandArgs[] = [];

		const result = await applyTrellisSetup({
			worktreePath: repoPath,
			initialize: true,
			runner: async (args) => {
				calls.push(args);
				await mkdir(join(repoPath, ".trellis", "tasks"), { recursive: true });
				await writeFile(join(repoPath, ".trellis", "config.yaml"), "");
				return { stdout: "", stderr: "" };
			},
			trellisBinPath: "/tmp/trellis.js",
			platforms: ["claude"],
		});

		expect(result.initialized).toBe(true);
		expect(result.state).toBe("ready");
		expect(result.warning).toBeNull();
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe(process.execPath);
		expect(calls[0]?.args).toEqual([
			"/tmp/trellis.js",
			"init",
			"--yes",
			"--skip-existing",
			"--claude",
		]);
		expect(calls[0]?.cwd).toBe(repoPath);
	});

	test("does not guess a platform when no task agent is selected", async () => {
		const repoPath = await tempRepo();
		const calls: TrellisCommandArgs[] = [];

		const result = await applyTrellisSetup({
			worktreePath: repoPath,
			initialize: true,
			runner: async (args) => {
				calls.push(args);
				await mkdir(join(repoPath, ".trellis", "tasks"), { recursive: true });
				await writeFile(join(repoPath, ".trellis", "config.yaml"), "");
				return { stdout: "", stderr: "" };
			},
			trellisBinPath: "/tmp/trellis.js",
		});

		expect(result.initialized).toBe(false);
		expect(result.state).toBe("missing");
		expect(result.warning).toContain("no supported Agent platform");
		expect(calls).toHaveLength(0);
	});

	test("does not overwrite partial Trellis setup", async () => {
		const repoPath = await tempRepo();
		await mkdir(join(repoPath, ".trellis"), { recursive: true });
		const calls: TrellisCommandArgs[] = [];

		const result = await applyTrellisSetup({
			worktreePath: repoPath,
			initialize: true,
			runner: async (args) => {
				calls.push(args);
				return { stdout: "", stderr: "" };
			},
			trellisBinPath: "/tmp/trellis.js",
		});

		expect(result.initialized).toBe(false);
		expect(result.state).toBe("partial");
		expect(result.warning).toContain("left untouched");
		expect(calls).toHaveLength(0);
	});

	test("returns warning instead of throwing when init fails", async () => {
		const repoPath = await tempRepo();

		const result = await applyTrellisSetup({
			worktreePath: repoPath,
			initialize: true,
			platforms: ["claude"],
			runner: async () => {
				throw new Error("boom");
			},
			trellisBinPath: "/tmp/trellis.js",
		});

		expect(result.initialized).toBe(false);
		expect(result.state).toBe("missing");
		expect(result.warning).toContain("boom");
	});
});
