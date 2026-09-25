/**
 * A/B bench for gitignored-dir watcher pruning.
 *
 * Simulates a dev server writing build output into a *gitignored* directory
 * (`buildout/`, deliberately absent from the static DEFAULT_IGNORE_PATTERNS)
 * while the real host-service pipeline is running: FsWatcherManager →
 * GitWatcher → EventBus → (mock renderer) → git-status refresh per
 * `git:changed`, through the production refresh limiter.
 *
 *   --variant after   current branch behavior (native prune + GitWatcher filter)
 *   --variant before  main-equivalent: no gitignore awareness (provider absent,
 *                     ignored-dir refresh disabled)
 *
 * Run from packages/host-service:
 *   bun scripts/gitignored-churn-bench.ts --variant before
 *   bun scripts/gitignored-churn-bench.ts --variant after
 */
import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { FsWatcherManager } from "@superset/workspace-fs/host";
import type { HostDb } from "../src/db";
import { EventBus } from "../src/events/event-bus";
import { GitWatcher } from "../src/events/git-watcher";
import type { ServerMessage } from "../src/events/types";
import { WorkspaceFilesystemManager } from "../src/runtime/filesystem";
import { gitStatusRefreshLimiter } from "../src/trpc/router/git/utils/git-status-refresh-limiter";
import { getHostWorkerPool } from "../src/workers/host-worker-pool";
import { gitStatusSnapshotTask } from "../src/workers/tasks/git";

type Variant = "before" | "after";

interface Options {
	variant: Variant;
	repoPath: string;
	outDir: string;
	files: number;
	churnEvents: number;
	churnIntervalMs: number;
	legitEdits: number;
}

const WORKSPACE_ID = "gitignored-churn-bench";
const SETTLE_MS = 3_000;

function parseArgs(argv: string[]): Options {
	const options: Options = {
		variant: "after",
		repoPath: resolve("/tmp/superset-gitignored-churn-repo"),
		outDir: resolve(".cache/gitignored-churn-bench"),
		files: 2_000,
		churnEvents: 300,
		churnIntervalMs: 20,
		legitEdits: 3,
	};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i];
		const value = argv[i + 1];
		if (key === "--variant" && (value === "before" || value === "after")) {
			options.variant = value;
		} else if (key === "--repo" && value) {
			options.repoPath = resolve(value);
		} else if (key === "--files" && value) {
			options.files = Number(value);
		} else if (key === "--churn" && value) {
			options.churnEvents = Number(value);
		} else if (key === "--interval" && value) {
			options.churnIntervalMs = Number(value);
		}
	}
	return options;
}

async function run(
	command: string,
	args: string[],
	cwd: string,
): Promise<void> {
	await new Promise<void>((resolveRun, rejectRun) => {
		const child = spawn(command, args, {
			cwd,
			env: process.env,
			stdio: ["ignore", "ignore", "pipe"],
		});
		const stderr: Buffer[] = [];
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", rejectRun);
		child.on("close", (code) => {
			if (code === 0) resolveRun();
			else
				rejectRun(
					new Error(
						`${command} ${args.join(" ")} exited ${code}: ${Buffer.concat(stderr).toString("utf8")}`,
					),
				);
		});
	});
}

function trackedFilePath(repoPath: string, id: number): string {
	const bucket = String(Math.floor(id / 1_000)).padStart(4, "0");
	return join(
		repoPath,
		"src",
		bucket,
		`file-${String(id).padStart(6, "0")}.ts`,
	);
}

async function writeTextFile(path: string, contents: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
}

/** Marker so the destructive reset below can never run on a real repo. */
const BENCH_MARKER = ".superset-bench-repo";

async function ensureRepo(options: Options): Promise<void> {
	if (existsSync(join(options.repoPath, ".git"))) {
		if (!existsSync(join(options.repoPath, BENCH_MARKER))) {
			throw new Error(
				`${options.repoPath} exists but is not a bench fixture (missing ${BENCH_MARKER}); refusing to reset it`,
			);
		}
		return;
	}
	console.log(
		`Creating bench repo (${options.files} files): ${options.repoPath}`,
	);
	await mkdir(options.repoPath, { recursive: true });
	await run("git", ["init", "-b", "main"], options.repoPath);
	await run(
		"git",
		["config", "user.email", "bench@example.invalid"],
		options.repoPath,
	);
	await run("git", ["config", "user.name", "Bench"], options.repoPath);
	await run("git", ["config", "gc.auto", "0"], options.repoPath);
	for (let id = 0; id < options.files; id++) {
		await writeTextFile(
			trackedFilePath(options.repoPath, id),
			`export const value${id} = ${id};\n`,
		);
	}
	await writeTextFile(join(options.repoPath, ".gitignore"), "buildout/\n");
	await writeTextFile(join(options.repoPath, BENCH_MARKER), "bench fixture\n");
	await run("git", ["add", "-A"], options.repoPath);
	await run("git", ["commit", "-m", "seed"], options.repoPath);
}

async function installGitShim(
	wrapperDir: string,
	logPath: string,
): Promise<void> {
	const execPath = await new Promise<string>((res, rej) => {
		const child = spawn("git", ["--exec-path"], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const out: Buffer[] = [];
		child.stdout.on("data", (c: Buffer) => out.push(c));
		child.on("error", rej);
		child.on("close", () => res(Buffer.concat(out).toString("utf8").trim()));
	});
	await mkdir(wrapperDir, { recursive: true });
	await writeFile(
		join(wrapperDir, "git"),
		[
			"#!/bin/sh",
			'printf "start\\t%s\\n" "$*" >> "$GIT_PROFILE_LOG"',
			`"${join(execPath, "git")}" "$@"`,
			"",
		].join("\n"),
	);
	chmodSync(join(wrapperDir, "git"), 0o755);
	await writeFile(logPath, "");
	process.env.GIT_PROFILE_LOG = logPath;
	process.env.PATH = `${wrapperDir}:${process.env.PATH ?? ""}`;
}

async function countGitInvocations(logPath: string): Promise<{
	invocations: number;
	topCommands: Array<{ command: string; count: number }>;
}> {
	const raw = await readFile(logPath, "utf8").catch(() => "");
	const counts = new Map<string, number>();
	let invocations = 0;
	for (const line of raw.split("\n")) {
		if (!line.startsWith("start\t")) continue;
		invocations++;
		const args = line.slice("start\t".length);
		const command =
			args
				.split(" ")
				.find((word) => !word.startsWith("-") && !word.includes("/")) ?? args;
		counts.set(command, (counts.get(command) ?? 0) + 1);
	}
	const topCommands = [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6)
		.map(([command, count]) => ({ command, count }));
	return { invocations, topCommands };
}

function createDb(): HostDb {
	const rows = [{ id: WORKSPACE_ID, worktreePath: "" }];
	return {
		select: () => ({
			from: () => ({
				where: () => ({ all: () => rows, get: () => rows[0] }),
				all: () => rows,
			}),
		}),
		query: {
			workspaces: {
				findFirst: () => ({ sync: () => rows[0] }),
			},
		},
	} as unknown as HostDb;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	await mkdir(options.outDir, { recursive: true });
	await ensureRepo(options);
	// Reset any prior churn.
	await run("git", ["reset", "--hard", "HEAD"], options.repoPath);
	await run("git", ["clean", "-fdx"], options.repoPath);
	await mkdir(join(options.repoPath, "buildout"), { recursive: true });
	await writeTextFile(
		join(options.repoPath, "buildout", "seed.js"),
		"// seed\n",
	);

	const label = `${options.variant}-${Date.now()}`;
	const gitLogPath = join(options.outDir, `${label}-git.log`);
	await installGitShim(join(options.outDir, `${label}-bin`), gitLogPath);

	const db = createDb();
	const rows = (
		db.select() as unknown as {
			from: () => { all: () => Array<{ worktreePath: string }> };
		}
	)
		.from()
		.all();
	if (rows[0]) rows[0].worktreePath = options.repoPath;

	const filesystem = new WorkspaceFilesystemManager({ db });
	if (options.variant === "before") {
		// Main-equivalent: strip gitignore awareness from the native watcher.
		(
			filesystem as unknown as { watcherManager: FsWatcherManager }
		).watcherManager = new FsWatcherManager();
	}
	const gitWatcher = new GitWatcher(db, filesystem);
	if (options.variant === "before") {
		// Main-equivalent: the ignored-dir set never populates, so the
		// GitWatcher event filter never drops anything.
		(
			gitWatcher as unknown as { refreshIgnoredDirs: () => void }
		).refreshIgnoredDirs = () => {};
	}
	const eventBus = new EventBus({ db, filesystem, gitWatcher });

	const workerPool = getHostWorkerPool();
	let gitChangedEvents = 0;
	let fsEventsDelivered = 0;
	let statusRefreshes = 0;
	const refreshPromises: Array<Promise<unknown>> = [];
	const gitEnv = Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);

	const runRefresh = async () => {
		statusRefreshes++;
		await workerPool.run(gitStatusSnapshotTask, {
			worktreePath: options.repoPath,
			gitEnv,
		});
	};

	const socket = {
		readyState: 1,
		send: (data: string) => {
			const message = JSON.parse(data) as ServerMessage;
			if (message.type === "fs:events") {
				fsEventsDelivered += message.events.length;
			}
			if (message.type === "git:changed") {
				gitChangedEvents++;
				const promise = gitStatusRefreshLimiter.run({
					workspaceId: WORKSPACE_ID,
					requestKey: "bench",
					run: runRefresh,
				});
				if (promise) refreshPromises.push(promise);
			}
		},
		close: () => {},
	};

	gitStatusRefreshLimiter.clear();
	eventBus.start();
	await (gitWatcher as unknown as { rescan: () => Promise<void> }).rescan();
	// Warm the worker and let attach-time git activity settle.
	await runRefresh();
	await new Promise((r) => setTimeout(r, 2_000));

	eventBus.handleOpen(socket);
	eventBus.handleMessage(
		socket,
		JSON.stringify({ type: "fs:watch", workspaceId: WORKSPACE_ID }),
	);
	// GitWatcher only watches a workspace while someone holds interest
	// (#6729) — the earlier direct rescan() call no longer attaches anything
	// on its own, so this bench needs to register interest explicitly, same
	// as a real client would.
	eventBus.handleMessage(
		socket,
		JSON.stringify({ type: "git:watch", workspaceId: WORKSPACE_ID }),
	);
	await new Promise((r) => setTimeout(r, 500));

	// Measurement window starts here.
	gitChangedEvents = 0;
	fsEventsDelivered = 0;
	statusRefreshes = 0;
	await writeFile(gitLogPath, "");
	const histogram = monitorEventLoopDelay({ resolution: 10 });
	histogram.enable();
	const startedAt = performance.now();

	// Build churn: a dev server writing into the gitignored dir.
	for (let event = 0; event < options.churnEvents; event++) {
		await writeTextFile(
			join(options.repoPath, "buildout", `chunk-${event % 50}.js`),
			`// build output ${event}\nmodule.exports = ${event};\n`,
		);
		if (options.churnIntervalMs > 0) {
			await new Promise((r) => setTimeout(r, options.churnIntervalMs));
		}
	}
	// Interleaved legit work: these MUST still produce signal in both variants.
	for (let edit = 0; edit < options.legitEdits; edit++) {
		await writeTextFile(
			trackedFilePath(options.repoPath, edit),
			`export const value${edit} = ${edit}; // edited\n`,
		);
		await new Promise((r) => setTimeout(r, 400));
	}

	await new Promise((r) => setTimeout(r, SETTLE_MS));
	await Promise.allSettled(refreshPromises);
	histogram.disable();
	const durationMs = Math.round(performance.now() - startedAt);
	const toMs = (ns: number) => Math.round((ns / 1_000_000) * 10) / 10;

	eventBus.handleClose(socket);
	eventBus.close();
	gitWatcher.close();
	await filesystem.close();
	gitStatusRefreshLimiter.clear();

	const gitStats = await countGitInvocations(gitLogPath);
	const result = {
		variant: options.variant,
		churnEvents: options.churnEvents,
		legitEdits: options.legitEdits,
		durationMs,
		fsEventsDelivered,
		gitChangedEvents,
		statusRefreshes,
		gitInvocations: gitStats.invocations,
		topGitCommands: gitStats.topCommands,
		eventLoopDelayMs: {
			p50: toMs(histogram.percentile(50)),
			p99: toMs(histogram.percentile(99)),
			max: toMs(histogram.max),
		},
	};
	console.log(JSON.stringify(result, null, 2));
	await writeFile(
		join(options.outDir, `${label}.json`),
		`${JSON.stringify(result, null, 2)}\n`,
	);
	process.exit(0);
}

void main();
