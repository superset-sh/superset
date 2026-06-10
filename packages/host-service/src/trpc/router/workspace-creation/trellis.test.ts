import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	applyTrellisSetup,
	canRunNodeEntrypoint,
	ensureSupersetTaskTrellisLink,
	getTrellisStatusAtPath,
	installSupersetTaskSyncHook,
	mergeTrellisHookConfig,
	resolveTrellisPlatformsFromAgents,
	resolveUnpackedAsarPath,
	type TrellisCommandArgs,
} from "./trellis";

const execFileAsync = promisify(execFile);
const PYTHON = process.env.PYTHON ?? "/usr/bin/python3";

async function tempRepo() {
	return mkdtemp(join(tmpdir(), "superset-trellis-"));
}

async function readyTrellisRepo() {
	const repoPath = await tempRepo();
	const trellisDir = join(repoPath, ".trellis");
	await mkdir(join(trellisDir, "tasks"), { recursive: true });
	await writeFile(join(trellisDir, "config.yaml"), "default_package: app\n");
	return repoPath;
}

function shellPythonScript(text: string) {
	return `#!${PYTHON}\n${text}`;
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
	test("rewrites packaged Trellis bin paths to app.asar.unpacked when available", () => {
		const asarPath =
			"/Applications/Superset Canary.app/Contents/Resources/app.asar/node_modules/@mindfoldhq/trellis/bin/trellis.js";
		const unpackedPath =
			"/Applications/Superset Canary.app/Contents/Resources/app.asar.unpacked/node_modules/@mindfoldhq/trellis/bin/trellis.js";

		expect(
			resolveUnpackedAsarPath(
				asarPath,
				(candidate) => candidate === unpackedPath,
			),
		).toBe(unpackedPath);
		expect(resolveUnpackedAsarPath(asarPath, () => false)).toBe(asarPath);
	});

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

describe("Superset Task Trellis bridge", () => {
	test("merges sync hook commands without removing existing hooks", () => {
		const config = [
			"default_package: app",
			"hooks:",
			"  after_start:",
			'    - "echo custom-start"',
			"  after_finish:",
			'    - "echo custom-finish"',
			"packages:",
			"  app:",
			"    path: app",
			"",
		].join("\n");

		const merged = mergeTrellisHookConfig(config, {
			after_create:
				"python3 .trellis/scripts/hooks/superset_task_sync.py after_create",
			after_start:
				"python3 .trellis/scripts/hooks/superset_task_sync.py after_start",
			after_archive:
				"python3 .trellis/scripts/hooks/superset_task_sync.py after_archive",
		});
		const second = mergeTrellisHookConfig(merged.text, {
			after_create:
				"python3 .trellis/scripts/hooks/superset_task_sync.py after_create",
			after_start:
				"python3 .trellis/scripts/hooks/superset_task_sync.py after_start",
			after_archive:
				"python3 .trellis/scripts/hooks/superset_task_sync.py after_archive",
		});

		expect(merged.changed).toBe(true);
		expect(merged.text).toContain('    - "echo custom-start"');
		expect(merged.text).toContain('    - "echo custom-finish"');
		expect(merged.text).toContain("  after_create:");
		expect(merged.text).toContain(
			'    - "python3 .trellis/scripts/hooks/superset_task_sync.py after_start"',
		);
		expect(merged.text).toContain("  after_archive:");
		expect(second.changed).toBe(false);
	});

	test("creates one linked Trellis task and reuses it on later calls", async () => {
		const repoPath = await readyTrellisRepo();
		const taskId = "11111111-1111-4111-8111-111111111111";

		const first = await ensureSupersetTaskTrellisLink({
			worktreePath: repoPath,
			workspaceId: "22222222-2222-4222-8222-222222222222",
			branch: "feature/task-sync",
			supersetTask: {
				id: taskId,
				slug: "sync-task",
				title: "Sync task status",
				description: "Keep Superset Task status aligned.",
			},
		});
		const second = await ensureSupersetTaskTrellisLink({
			worktreePath: repoPath,
			workspaceId: "33333333-3333-4333-8333-333333333333",
			branch: "feature/task-sync",
			supersetTask: {
				id: taskId,
				slug: "sync-task",
				title: "Sync task status",
				description: "Keep Superset Task status aligned.",
			},
		});

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.taskJsonPath).toBe(first.taskJsonPath);

		const taskJson = JSON.parse(
			await readFile(first.taskJsonPath ?? "", "utf8"),
		) as {
			status: string;
			meta: Record<string, unknown>;
			branch: string;
		};
		expect(taskJson.status).toBe("planning");
		expect(taskJson.branch).toBe("feature/task-sync");
		expect(taskJson.meta.supersetTaskId).toBe(taskId);
		expect(taskJson.meta.supersetTaskSlug).toBe("sync-task");
		expect(taskJson.meta.supersetWorkspaceId).toBe(
			"33333333-3333-4333-8333-333333333333",
		);

		const linkJson = JSON.parse(
			await readFile(
				join(repoPath, ".trellis", "superset", "task-link.json"),
				"utf8",
			),
		) as Record<string, unknown>;
		expect(linkJson.supersetTaskId).toBe(taskId);
		expect(linkJson.supersetTaskSlug).toBe("sync-task");
		expect(linkJson.supersetWorkspaceId).toBe(
			"33333333-3333-4333-8333-333333333333",
		);
		expect(linkJson.taskJsonPath).toBe(first.taskJsonPath);
	});

	test("repairs a matching existing Trellis task when metadata was rewritten", async () => {
		const repoPath = await readyTrellisRepo();
		const taskDir = join(repoPath, ".trellis", "tasks", "06-08-sync-task");
		await mkdir(taskDir, { recursive: true });
		const taskJsonPath = join(taskDir, "task.json");
		await writeFile(
			taskJsonPath,
			JSON.stringify(
				{
					id: "sync-task",
					name: "sync-task",
					title: "Sync task status",
					status: "in_progress",
					meta: {},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await ensureSupersetTaskTrellisLink({
			worktreePath: repoPath,
			workspaceId: "44444444-4444-4444-8444-444444444444",
			branch: "feature/repair",
			supersetTask: {
				id: "33333333-3333-4333-8333-333333333333",
				slug: "sync-task",
				title: "Sync task status",
			},
		});

		expect(result.created).toBe(false);
		expect(result.taskJsonPath).toBe(taskJsonPath);

		const taskJson = JSON.parse(await readFile(taskJsonPath, "utf8")) as {
			meta: Record<string, unknown>;
			branch: string;
			worktree_path: string;
		};
		expect(taskJson.branch).toBe("feature/repair");
		expect(taskJson.worktree_path).toBe(repoPath);
		expect(taskJson.meta.supersetTaskId).toBe(
			"33333333-3333-4333-8333-333333333333",
		);
		expect(taskJson.meta.supersetWorkspaceId).toBe(
			"44444444-4444-4444-8444-444444444444",
		);

		const linkJson = JSON.parse(
			await readFile(
				join(repoPath, ".trellis", "superset", "task-link.json"),
				"utf8",
			),
		) as Record<string, unknown>;
		expect(linkJson.supersetTaskId).toBe(
			"33333333-3333-4333-8333-333333333333",
		);
		expect(linkJson.taskJsonPath).toBe(taskJsonPath);
	});

	test("installs the sync hook script and appends lifecycle hooks idempotently", async () => {
		const repoPath = await readyTrellisRepo();
		await writeFile(
			join(repoPath, ".trellis", "config.yaml"),
			["hooks:", "  after_start:", '    - "echo custom-start"', ""].join("\n"),
		);

		const first = await installSupersetTaskSyncHook({ worktreePath: repoPath });
		const second = await installSupersetTaskSyncHook({
			worktreePath: repoPath,
		});
		const config = await readFile(
			join(repoPath, ".trellis", "config.yaml"),
			"utf8",
		);
		const script = await readFile(
			join(repoPath, ".trellis", "scripts", "hooks", "superset_task_sync.py"),
			"utf8",
		);

		expect(first.installed).toBe(true);
		expect(first.configChanged).toBe(true);
		expect(second.installed).toBe(true);
		expect(second.configChanged).toBe(false);
		expect(config).toContain('    - "echo custom-start"');
		expect(config).toContain("superset_task_sync.py after_create");
		expect(config).toContain("superset_task_sync.py after_start");
		expect(config).toContain("superset_task_sync.py after_archive");
		expect(script).toContain("EVENT_TO_STATUS_TYPE");
	});

	test("sync hook maps Trellis create/start/archive to Superset status updates", async () => {
		const repoPath = await readyTrellisRepo();
		const taskId = "44444444-4444-4444-8444-444444444444";
		await ensureSupersetTaskTrellisLink({
			worktreePath: repoPath,
			workspaceId: "55555555-5555-4555-8555-555555555555",
			branch: "feature/sync",
			supersetTask: { id: taskId, slug: "hook-sync", title: "Hook sync" },
		});
		await installSupersetTaskSyncHook({ worktreePath: repoPath });
		const taskJsonPath = join(
			repoPath,
			".trellis",
			"tasks",
			await readdirTaskDir(repoPath),
			"task.json",
		);
		const hookPath = join(
			repoPath,
			".trellis",
			"scripts",
			"hooks",
			"superset_task_sync.py",
		);

		const fakeBin = join(repoPath, "fake-bin");
		const logPath = join(repoPath, "cli-calls.jsonl");
		await mkdir(fakeBin, { recursive: true });
		const fakeSuperset = join(fakeBin, "superset");
		await writeFile(
			fakeSuperset,
			shellPythonScript(`
import json
import os
import sys

with open(os.environ["CAPTURE_PATH"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps(sys.argv[1:]) + "\\n")

args = sys.argv[1:]
if args == ["tasks", "statuses", "list", "--json"]:
    print(json.dumps([
        {"id": "unstarted-status", "type": "unstarted"},
        {"id": "started-status", "type": "started"},
        {"id": "completed-status", "type": "completed"},
    ]))
    raise SystemExit(0)
if args[:2] == ["tasks", "update"]:
    print(json.dumps({"ok": True}))
    raise SystemExit(0)
raise SystemExit(2)
`),
			"utf8",
		);
		await chmod(fakeSuperset, 0o755);

		for (const event of [
			"after_create",
			"after_start",
			"after_archive",
			"after_finish",
		]) {
			await execFileAsync(PYTHON, [hookPath, event], {
				cwd: repoPath,
				env: {
					TASK_JSON_PATH: taskJsonPath,
					SUPERSET_HOME_DIR: join(repoPath, "empty-home"),
					PATH: fakeBin,
					CAPTURE_PATH: logPath,
				},
			});
		}

		const calls = (await readFile(logPath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as string[]);
		expect(calls).toEqual([
			["tasks", "statuses", "list", "--json"],
			["tasks", "update", taskId, "--status-id", "unstarted-status", "--json"],
			["tasks", "statuses", "list", "--json"],
			["tasks", "update", taskId, "--status-id", "started-status", "--json"],
			["tasks", "statuses", "list", "--json"],
			["tasks", "update", taskId, "--status-id", "completed-status", "--json"],
		]);
	});

	test("sync hook falls back to the durable workspace link when task metadata is rewritten", async () => {
		const repoPath = await readyTrellisRepo();
		const taskId = "88888888-8888-4888-8888-888888888888";
		await ensureSupersetTaskTrellisLink({
			worktreePath: repoPath,
			workspaceId: "99999999-9999-4999-8999-999999999999",
			branch: "feature/fallback",
			supersetTask: { id: taskId, slug: "fallback-sync", title: "Fallback" },
		});
		await installSupersetTaskSyncHook({ worktreePath: repoPath });
		const taskJsonPath = join(
			repoPath,
			".trellis",
			"tasks",
			await readdirTaskDir(repoPath),
			"task.json",
		);
		await writeFile(
			taskJsonPath,
			JSON.stringify({ status: "in_progress", meta: {} }, null, 2),
			"utf8",
		);

		const fake = await writeLoggingSupersetCli(repoPath, [
			{ id: "started-status", type: "started" },
		]);
		await execFileAsync(
			PYTHON,
			[
				join(repoPath, ".trellis", "scripts", "hooks", "superset_task_sync.py"),
				"after_start",
			],
			{
				cwd: repoPath,
				env: {
					TASK_JSON_PATH: taskJsonPath,
					SUPERSET_HOME_DIR: join(repoPath, "empty-home"),
					PATH: fake.binDir,
					CAPTURE_PATH: fake.logPath,
				},
			},
		);

		const calls = (await readFile(fake.logPath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as string[]);
		expect(calls).toEqual([
			["tasks", "statuses", "list", "--json"],
			["tasks", "update", taskId, "--status-id", "started-status", "--json"],
		]);
	});

	test("sync hook exits successfully when CLI is missing", async () => {
		const repoPath = await readyTrellisRepo();
		await ensureSupersetTaskTrellisLink({
			worktreePath: repoPath,
			supersetTask: {
				id: "66666666-6666-4666-8666-666666666666",
				title: "Missing CLI",
			},
		});
		await installSupersetTaskSyncHook({ worktreePath: repoPath });
		const taskJsonPath = join(
			repoPath,
			".trellis",
			"tasks",
			await readdirTaskDir(repoPath),
			"task.json",
		);

		const result = await execFileAsync(
			PYTHON,
			[
				join(repoPath, ".trellis", "scripts", "hooks", "superset_task_sync.py"),
				"after_start",
			],
			{
				cwd: repoPath,
				env: {
					TASK_JSON_PATH: taskJsonPath,
					SUPERSET_HOME_DIR: join(repoPath, "empty-home"),
					PATH: join(repoPath, "empty-bin"),
				},
			},
		);

		expect(result.stderr).toContain("Superset CLI was not found");
	});

	test("sync hook no-ops without TASK_JSON_PATH or linked metadata", async () => {
		const repoPath = await readyTrellisRepo();
		await installSupersetTaskSyncHook({ worktreePath: repoPath });
		const hookPath = join(
			repoPath,
			".trellis",
			"scripts",
			"hooks",
			"superset_task_sync.py",
		);
		const fake = await writeLoggingSupersetCli(repoPath, [
			{ id: "started-status", type: "started" },
		]);

		await execFileAsync(PYTHON, [hookPath, "after_start"], {
			cwd: repoPath,
			env: {
				SUPERSET_HOME_DIR: join(repoPath, "empty-home"),
				PATH: fake.binDir,
				CAPTURE_PATH: fake.logPath,
			},
		});

		const unlinkedDir = join(repoPath, ".trellis", "tasks", "06-08-unlinked");
		await mkdir(unlinkedDir, { recursive: true });
		const unlinkedTaskJson = join(unlinkedDir, "task.json");
		await writeFile(unlinkedTaskJson, JSON.stringify({ meta: {} }), "utf8");

		await execFileAsync(PYTHON, [hookPath, "after_start"], {
			cwd: repoPath,
			env: {
				TASK_JSON_PATH: unlinkedTaskJson,
				SUPERSET_HOME_DIR: join(repoPath, "empty-home"),
				PATH: fake.binDir,
				CAPTURE_PATH: fake.logPath,
			},
		});

		await expect(readFile(fake.logPath, "utf8")).rejects.toThrow();
	});

	test("sync hook warns but exits when the target status type is unavailable", async () => {
		const repoPath = await readyTrellisRepo();
		await ensureSupersetTaskTrellisLink({
			worktreePath: repoPath,
			supersetTask: {
				id: "77777777-7777-4777-8777-777777777777",
				title: "Missing completed status",
			},
		});
		await installSupersetTaskSyncHook({ worktreePath: repoPath });
		const fake = await writeLoggingSupersetCli(repoPath, [
			{ id: "started-status", type: "started" },
		]);
		const result = await execFileAsync(
			PYTHON,
			[
				join(repoPath, ".trellis", "scripts", "hooks", "superset_task_sync.py"),
				"after_archive",
			],
			{
				cwd: repoPath,
				env: {
					TASK_JSON_PATH: join(
						repoPath,
						".trellis",
						"tasks",
						await readdirTaskDir(repoPath),
						"task.json",
					),
					SUPERSET_HOME_DIR: join(repoPath, "empty-home"),
					PATH: fake.binDir,
					CAPTURE_PATH: fake.logPath,
				},
			},
		);

		const calls = (await readFile(fake.logPath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as string[]);
		expect(calls).toEqual([["tasks", "statuses", "list", "--json"]]);
		expect(result.stderr).toContain("Superset task status type not found");
	});

	test("workspaces.create applies the bridge for linked Superset Tasks", async () => {
		const source = await readFile(
			join(import.meta.dirname, "..", "workspaces", "workspaces.ts"),
			"utf8",
		);

		expect(source).toContain("applySupersetTaskTrellisBridge");
		expect(source).toContain("ctx.api.task.byId");
		expect(source).toContain("supersetTask:");
		expect(source).toContain("workspaceId: workspaceRow.id");
	});
});

async function readdirTaskDir(repoPath: string): Promise<string> {
	const entries = await readdir(join(repoPath, ".trellis", "tasks"), {
		withFileTypes: true,
	});
	const taskDir = entries.find((entry) => entry.isDirectory());
	if (!taskDir) throw new Error("Expected a Trellis task dir");
	return taskDir.name;
}

async function writeLoggingSupersetCli(
	repoPath: string,
	statuses: Array<{ id: string; type: string }>,
): Promise<{ binDir: string; logPath: string }> {
	const binDir = join(repoPath, `fake-bin-${crypto.randomUUID()}`);
	const logPath = join(repoPath, `cli-calls-${crypto.randomUUID()}.jsonl`);
	await mkdir(binDir, { recursive: true });
	const fakeSuperset = join(binDir, "superset");
	await writeFile(
		fakeSuperset,
		shellPythonScript(`
import json
import os
import sys

with open(os.environ["CAPTURE_PATH"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps(sys.argv[1:]) + "\\n")

args = sys.argv[1:]
if args == ["tasks", "statuses", "list", "--json"]:
    print(json.dumps(${JSON.stringify(statuses)}))
    raise SystemExit(0)
if args[:2] == ["tasks", "update"]:
    print(json.dumps({"ok": True}))
    raise SystemExit(0)
raise SystemExit(2)
`),
		"utf8",
	);
	await chmod(fakeSuperset, 0o755);
	return { binDir, logPath };
}
