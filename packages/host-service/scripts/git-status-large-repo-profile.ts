import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { HostDb } from "../src/db";
import { EventBus } from "../src/events/event-bus";
import { GitWatcher } from "../src/events/git-watcher";
import type { ServerMessage } from "../src/events/types";
import { WorkspaceFilesystemManager } from "../src/runtime/filesystem";
import {
	GitStatusRefreshLimiter,
	gitStatusRefreshLimiter,
} from "../src/trpc/router/git/utils/git-status-refresh-limiter";
import { getHostWorkerPool } from "../src/workers/host-worker-pool";
import { gitStatusSnapshotTask } from "../src/workers/tasks/git";

type Mode = "limited" | "unbounded";
type Flow = "compute" | "event-bus";

interface Options {
	repoPath: string;
	outDir: string;
	files: number;
	dirty: number;
	events: number;
	eventIntervalMs: number;
	concurrency: number;
	workspaces: number;
	gitDelayMs: number;
	mode: Mode | "both";
	flow: Flow;
	refreshOnGitChange: boolean;
	recreate: boolean;
	cdpPort: number | null;
}

interface ScenarioResult {
	flow: Flow;
	mode: Mode;
	executionMode: "worker" | "inline";
	requestedRefreshes: number;
	worktreeMutations?: number;
	gitChangedEvents?: number;
	actualRefreshes: number;
	durationMs: number;
	maxActiveRefreshes: number;
	eventLoopDelayMs: { p50: number; p99: number; max: number };
	gitInvocations: number;
	maxActiveGitProcesses: number;
	topGitCommands: Array<{ command: string; count: number }>;
	statusSummary: {
		againstBase: number;
		staged: number;
		unstaged: number;
		ignoredPaths: number;
	};
}

interface CdpCapture {
	stop: () => Promise<{ profilePath: string; metricsPath: string } | null>;
}

const DEFAULT_REPO_PATH = ".cache/git-status-large-repo";
const DEFAULT_OUT_DIR = ".cache/git-status-profiles";
const GIT_DIR_WARMUP_SETTLE_MS = 1_200;

function parseArgs(argv: string[]): Options {
	const options: Options = {
		repoPath: resolve(DEFAULT_REPO_PATH),
		outDir: resolve(DEFAULT_OUT_DIR),
		files: 20_000,
		dirty: 600,
		events: 60,
		eventIntervalMs: 50,
		concurrency: 4,
		workspaces: 1,
		gitDelayMs: 0,
		mode: "both",
		flow: "compute",
		refreshOnGitChange: true,
		recreate: false,
		cdpPort: null,
	};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		const next = () => {
			const value = argv[++index];
			if (!value) throw new Error(`Missing value for ${arg}`);
			return value;
		};

		switch (arg) {
			case "--repo":
				options.repoPath = resolve(next());
				break;
			case "--out":
				options.outDir = resolve(next());
				break;
			case "--files":
				options.files = Number(next());
				break;
			case "--dirty":
				options.dirty = Number(next());
				break;
			case "--events":
				options.events = Number(next());
				break;
			case "--event-interval-ms":
				options.eventIntervalMs = Number(next());
				break;
			case "--concurrency":
				options.concurrency = Number(next());
				break;
			case "--workspaces":
				options.workspaces = Number(next());
				break;
			case "--git-delay-ms":
				options.gitDelayMs = Number(next());
				break;
			case "--mode": {
				const mode = next();
				if (mode !== "limited" && mode !== "unbounded" && mode !== "both") {
					throw new Error(`Invalid mode: ${mode}`);
				}
				options.mode = mode;
				break;
			}
			case "--flow": {
				const flow = next();
				if (flow !== "compute" && flow !== "event-bus") {
					throw new Error(`Invalid flow: ${flow}`);
				}
				options.flow = flow;
				break;
			}
			case "--watcher-only":
				options.refreshOnGitChange = false;
				break;
			case "--recreate":
				options.recreate = true;
				break;
			case "--cdp-port":
				options.cdpPort = Number(next());
				break;
			case "--help":
				printHelp();
				process.exit(0);
				return options;
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}

	for (const [name, value] of Object.entries({
		files: options.files,
		dirty: options.dirty,
		events: options.events,
		eventIntervalMs: options.eventIntervalMs,
		concurrency: options.concurrency,
		workspaces: options.workspaces,
		gitDelayMs: options.gitDelayMs,
	})) {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error(`${name} must be a non-negative number`);
		}
	}
	if (options.files < 1) throw new Error("files must be at least 1");
	if (options.events < 1) throw new Error("events must be at least 1");
	if (options.concurrency < 1)
		throw new Error("concurrency must be at least 1");
	if (options.workspaces < 1) throw new Error("workspaces must be at least 1");

	return options;
}

function printHelp(): void {
	console.log(`Usage:
  bun run packages/host-service/scripts/git-status-large-repo-profile.ts [options]

Options:
  --repo <path>                Synthetic repo path. Default: ${DEFAULT_REPO_PATH}
  --out <path>                 Output directory. Default: ${DEFAULT_OUT_DIR}
  --files <n>                  Tracked file count. Default: 20000
  --dirty <n>                  Dirty file count. Default: 600
  --events <n>                 Refresh invalidation count. Default: 60
  --event-interval-ms <n>      Delay between invalidations. Default: 50
  --concurrency <n>            Limiter concurrency. Default: 4
  --workspaces <n>             Distinct limiter workspace keys. Default: 1
  --git-delay-ms <n>           Artificial delay before each git subprocess.
                               Useful for modeling EDR/exec overhead.
  --mode <limited|unbounded|both>
  --flow <compute|event-bus>   compute stresses getStatus directly; event-bus
                               runs GitWatcher → EventBus → client refresh.
  --watcher-only              In event-bus flow, observe events without running
                               status refreshes (isolates watcher loop cost).
  --recreate                   Delete and recreate the synthetic repo first
  --cdp-port <port>            Capture renderer CPU profile from Electron CDP
`);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	validateEventBusRepoPath(options);
	await mkdir(options.outDir, { recursive: true });
	await ensureLargeRepo(options);

	const modes: Mode[] =
		options.mode === "both" ? ["unbounded", "limited"] : [options.mode];
	const results: ScenarioResult[] = [];

	for (const mode of modes) {
		await resetDirtyState(options.repoPath);
		await makeDirtyState(options.repoPath, options);

		const label = `${mode}-${Date.now()}`;
		const cdp = await startCdpCapture(options, label);
		const result = await runScenario(options, mode, label);
		const cdpResult = cdp ? await cdp.stop() : null;

		results.push(result);
		console.log(JSON.stringify({ ...result, cdp: cdpResult }, null, 2));
	}

	const summaryPath = join(options.outDir, `summary-${Date.now()}.json`);
	await writeFile(
		summaryPath,
		`${JSON.stringify({ options, results }, null, 2)}\n`,
	);
	console.log(`Wrote summary: ${summaryPath}`);
}

function validateEventBusRepoPath(options: Options): void {
	if (options.flow !== "event-bus") return;
	const ignoredSegment = options.repoPath
		.split(/[\\/]+/)
		.find((segment) =>
			new Set([
				".cache",
				"node_modules",
				"dist",
				"build",
				".next",
				".turbo",
				"coverage",
				".parcel-cache",
				".vite",
				".svelte-kit",
				".vercel",
				"target",
				"out",
			]).has(segment),
		);
	if (!ignoredSegment) return;
	throw new Error(
		`--flow event-bus repo path must not live under ${ignoredSegment}; workspace-fs ignores that directory. Use a path like /tmp/superset-git-status-large-repo.`,
	);
}

async function ensureLargeRepo(options: Options): Promise<void> {
	if (options.recreate) {
		await rm(options.repoPath, { recursive: true, force: true });
	}
	if (existsSync(join(options.repoPath, ".git"))) {
		console.log(`Using existing synthetic repo: ${options.repoPath}`);
		return;
	}

	console.log(
		`Creating synthetic repo with ${options.files} tracked files: ${options.repoPath}`,
	);
	await mkdir(options.repoPath, { recursive: true });
	await run("git", ["init", "-b", "main"], options.repoPath);
	await run(
		"git",
		["config", "user.email", "stress@example.invalid"],
		options.repoPath,
	);
	await run("git", ["config", "user.name", "Stress Harness"], options.repoPath);
	await run("git", ["config", "gc.auto", "0"], options.repoPath);

	const batchSize = 500;
	for (let start = 0; start < options.files; start += batchSize) {
		const end = Math.min(options.files, start + batchSize);
		await Promise.all(
			Array.from({ length: end - start }, (_, offset) => {
				const id = start + offset;
				const path = trackedFilePath(options.repoPath, id);
				return writeTextFile(
					path,
					[
						`export const value${id} = ${id};`,
						`export function fn${id}() { return value${id}; }`,
						"",
					].join("\n"),
				);
			}),
		);
		if (end % 5_000 === 0 || end === options.files) {
			console.log(`  wrote ${end}/${options.files} files`);
		}
	}

	await run("git", ["add", "-A"], options.repoPath);
	await run("git", ["commit", "-m", "seed large repo"], options.repoPath);
}

async function resetDirtyState(repoPath: string): Promise<void> {
	await run("git", ["reset", "--hard", "HEAD"], repoPath);
	await run("git", ["clean", "-fd"], repoPath);
}

async function makeDirtyState(
	repoPath: string,
	options: Options,
): Promise<void> {
	const modifyCount = Math.floor(options.dirty * 0.6);
	const untrackedCount = Math.floor(options.dirty * 0.25);
	const deleteCount = options.dirty - modifyCount - untrackedCount;

	for (let index = 0; index < modifyCount; index++) {
		const id = index % options.files;
		await writeTextFile(
			trackedFilePath(repoPath, id),
			[
				`export const value${id} = ${id};`,
				`export function fn${id}() { return value${id} + ${index}; }`,
				`export const dirty${index} = true;`,
				"",
			].join("\n"),
		);
	}

	for (let index = 0; index < untrackedCount; index++) {
		await writeTextFile(
			join(repoPath, "generated", `untracked-${index}.txt`),
			`untracked ${index}\n`,
		);
	}

	for (let index = 0; index < deleteCount; index++) {
		const id = options.files - index - 1;
		await rm(trackedFilePath(repoPath, id), { force: true });
	}
}

async function runScenario(
	options: Options,
	mode: Mode,
	label: string,
): Promise<ScenarioResult> {
	if (options.flow === "event-bus") {
		return runEventBusScenario(options, mode, label);
	}

	const gitLogPath = join(options.outDir, `${label}-git.log`);
	const wrapperDir = join(options.outDir, `${label}-bin`);
	const realGit = await commandOutput("git", ["--exec-path"]);
	const realGitBinary = join(realGit.trim(), "git");
	await installGitWrapper(wrapperDir, gitLogPath, realGitBinary);

	let activeRefreshes = 0;
	let maxActiveRefreshes = 0;
	let actualRefreshes = 0;
	let lastSummary: ScenarioResult["statusSummary"] | null = null;
	const limiter = new GitStatusRefreshLimiter(options.concurrency);
	const workerPool = getHostWorkerPool();
	const executionMode = workerPool.getMode();
	const promises: Array<Promise<unknown>> = [];
	const gitEnv = createProfileGitEnv({
		gitLogPath,
		gitDelayMs: options.gitDelayMs,
		realGitBinary,
		wrapperDir,
	});

	const runRefresh = async () => {
		actualRefreshes++;
		activeRefreshes++;
		maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
		try {
			const result = await workerPool.run(gitStatusSnapshotTask, {
				worktreePath: options.repoPath,
				gitEnv,
			});
			const status = result.snapshot;
			lastSummary = {
				againstBase: status.againstBase.length,
				staged: status.staged.length,
				unstaged: status.unstaged.length,
				ignoredPaths: status.ignoredPaths.length,
			};
			return status;
		} finally {
			activeRefreshes--;
		}
	};

	// Exclude worker startup / source transpilation from the measured window.
	await runRefresh();
	actualRefreshes = 0;
	activeRefreshes = 0;
	maxActiveRefreshes = 0;
	lastSummary = null;
	await writeFile(gitLogPath, "");
	const stopEventLoopMonitor = startEventLoopMonitor();
	const startedAt = performance.now();

	for (let event = 0; event < options.events; event++) {
		const promise =
			mode === "limited"
				? limiter.run({
						workspaceId: `large-repo-${event % options.workspaces}`,
						requestKey: JSON.stringify({ baseBranch: null }),
						run: runRefresh,
					})
				: runRefresh();
		promises.push(promise);
		if (options.eventIntervalMs > 0) {
			await sleep(options.eventIntervalMs);
		}
	}

	const settled = await Promise.allSettled(promises);
	const failedRefreshes = settled.filter(
		(result) => result.status === "rejected",
	);
	if (failedRefreshes.length > 0) {
		throw new Error(
			`${failedRefreshes.length} refreshes failed; first error: ${String(
				failedRefreshes[0]?.reason,
			)}`,
		);
	}
	const gitStats = await parseGitLog(gitLogPath);
	const eventLoopDelayMs = stopEventLoopMonitor();

	return {
		flow: "compute",
		mode,
		executionMode,
		requestedRefreshes: options.events,
		actualRefreshes,
		durationMs: Math.round(performance.now() - startedAt),
		maxActiveRefreshes,
		eventLoopDelayMs,
		gitInvocations: gitStats.invocations,
		maxActiveGitProcesses: gitStats.maxActive,
		topGitCommands: gitStats.topCommands,
		statusSummary: lastSummary ?? {
			againstBase: 0,
			staged: 0,
			unstaged: 0,
			ignoredPaths: 0,
		},
	};
}

async function runEventBusScenario(
	options: Options,
	mode: Mode,
	label: string,
): Promise<ScenarioResult> {
	const workspaceIds = Array.from(
		{ length: options.workspaces },
		(_, index) => `large-repo-${index}`,
	);
	const workspaceIdSet = new Set(workspaceIds);
	const workspacePaths = await prepareProfileWorktrees(options);
	const worktreePathByWorkspaceId = new Map(
		workspaceIds.map((id, index) => [
			id,
			workspacePaths[index] ?? options.repoPath,
		]),
	);
	const gitLogPath = join(options.outDir, `${label}-git.log`);
	const wrapperDir = join(options.outDir, `${label}-bin`);
	const realGit = await commandOutput("git", ["--exec-path"]);
	const realGitBinary = join(realGit.trim(), "git");
	await installGitWrapper(wrapperDir, gitLogPath, realGitBinary);

	const db = createWorkspaceDb(worktreePathByWorkspaceId);
	const filesystem = new WorkspaceFilesystemManager({ db });
	const gitWatcher = new GitWatcher(db, filesystem);
	const eventBus = new EventBus({ db, filesystem, gitWatcher });
	const refreshPromises: Array<Promise<unknown>> = [];
	let gitChangedEvents = 0;
	let actualRefreshes = 0;
	let activeRefreshes = 0;
	let maxActiveRefreshes = 0;
	let lastSummary: ScenarioResult["statusSummary"] | null = null;
	const workerPool = getHostWorkerPool();
	const executionMode = workerPool.getMode();
	const gitEnv = createProfileGitEnv({
		gitLogPath,
		gitDelayMs: options.gitDelayMs,
		realGitBinary,
		wrapperDir,
	});

	const runRefresh = async (workspaceId: string) => {
		actualRefreshes++;
		activeRefreshes++;
		maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
		try {
			const worktreePath =
				worktreePathByWorkspaceId.get(workspaceId) ?? options.repoPath;
			const result = await workerPool.run(gitStatusSnapshotTask, {
				worktreePath,
				gitEnv,
			});
			lastSummary = summarizeStatus(result.snapshot);
			return result.snapshot;
		} finally {
			activeRefreshes--;
		}
	};

	const socket: {
		readyState: number;
		send: (data: string) => void;
		close: () => void;
	} = {
		readyState: 1,
		send: (data) => {
			const message = JSON.parse(data) as ServerMessage;
			if (
				message.type !== "git:changed" ||
				!workspaceIdSet.has(message.workspaceId)
			) {
				return;
			}
			gitChangedEvents++;
			if (!options.refreshOnGitChange) return;
			const promise =
				mode === "limited"
					? gitStatusRefreshLimiter.run({
							workspaceId: message.workspaceId,
							requestKey: JSON.stringify({ baseBranch: null }),
							run: () => runRefresh(message.workspaceId),
						})
					: runRefresh(message.workspaceId);
			if (promise) refreshPromises.push(promise);
		},
		close: () => {
			socket.readyState = 3;
		},
	};

	gitStatusRefreshLimiter.clear();
	eventBus.start();
	await (gitWatcher as unknown as { rescan: () => Promise<void> }).rescan();
	await sleep(500);

	// Warm the worker and Git implementation before measuring watcher churn.
	await Promise.all(workspaceIds.map((id) => runRefresh(id)));
	// Let any watcher events caused by warm-up Git processes flush before the
	// mock renderer attaches, so they cannot race the measurement counters.
	await sleep(GIT_DIR_WARMUP_SETTLE_MS);
	actualRefreshes = 0;
	activeRefreshes = 0;
	maxActiveRefreshes = 0;
	lastSummary = null;
	await writeFile(gitLogPath, "");
	eventBus.handleOpen(socket);
	const stopEventLoopMonitor = startEventLoopMonitor();
	const startedAt = performance.now();

	let closedEventSources = false;
	const closeEventSources = async () => {
		if (closedEventSources) return;
		closedEventSources = true;
		eventBus.handleClose(socket);
		eventBus.close();
		gitWatcher.close();
		await filesystem.close();
	};

	try {
		// Keep the load generator off this process's event loop; otherwise a
		// high-volume run measures its own mkdir/writeFile promises alongside
		// GitWatcher and overstates watcher-induced delay.
		await mutateChurnFilesInChild(
			workspacePaths,
			options.events,
			options.eventIntervalMs,
			options.files,
		);

		await sleep(Math.max(1_000, options.eventIntervalMs + 1_000));
		await closeEventSources();
		const settled = await Promise.allSettled(refreshPromises);
		const failedRefreshes = settled.filter(
			(result) => result.status === "rejected",
		);
		if (failedRefreshes.length > 0) {
			throw new Error(
				`${failedRefreshes.length} refreshes failed; first error: ${String(
					failedRefreshes[0]?.reason,
				)}`,
			);
		}

		const gitStats = await parseGitLog(gitLogPath);
		const eventLoopDelayMs = stopEventLoopMonitor();
		return {
			flow: "event-bus",
			mode,
			executionMode,
			requestedRefreshes: gitChangedEvents,
			worktreeMutations: options.events,
			gitChangedEvents,
			actualRefreshes,
			durationMs: Math.round(performance.now() - startedAt),
			maxActiveRefreshes,
			eventLoopDelayMs,
			gitInvocations: gitStats.invocations,
			maxActiveGitProcesses: gitStats.maxActive,
			topGitCommands: gitStats.topCommands,
			statusSummary: lastSummary ?? {
				againstBase: 0,
				staged: 0,
				unstaged: 0,
				ignoredPaths: 0,
			},
		};
	} finally {
		await closeEventSources();
		gitStatusRefreshLimiter.clear();
	}
}

async function startCdpCapture(
	options: Options,
	label: string,
): Promise<CdpCapture | null> {
	if (!options.cdpPort) return null;

	try {
		const targets = (await fetch(
			`http://127.0.0.1:${options.cdpPort}/json/list`,
		).then((response) => response.json())) as Array<{
			type?: string;
			title?: string;
			url?: string;
			webSocketDebuggerUrl?: string;
		}>;
		const target =
			targets.find(
				(item) => item.type === "page" && item.webSocketDebuggerUrl,
			) ?? targets.find((item) => item.webSocketDebuggerUrl);
		if (!target?.webSocketDebuggerUrl) {
			console.warn(`No CDP target found on port ${options.cdpPort}`);
			return null;
		}

		const client = await connectCdp(target.webSocketDebuggerUrl);
		await client.send("Profiler.enable");
		await client.send("Performance.enable");
		const beforeMetrics = await client
			.send("Performance.getMetrics")
			.catch(() => null);
		await client.send("Profiler.start");

		return {
			stop: async () => {
				const stopped = await client.send("Profiler.stop").catch((error) => {
					console.warn(`CDP Profiler.stop failed: ${String(error)}`);
					return null;
				});
				const afterMetrics = await client
					.send("Performance.getMetrics")
					.catch(() => null);
				client.close();
				if (
					!stopped ||
					typeof stopped !== "object" ||
					!("profile" in stopped)
				) {
					return null;
				}

				const profilePath = join(options.outDir, `${label}.cpuprofile`);
				const metricsPath = join(options.outDir, `${label}-cdp-metrics.json`);
				await writeFile(
					profilePath,
					`${JSON.stringify((stopped as { profile: unknown }).profile)}\n`,
				);
				await writeFile(
					metricsPath,
					`${JSON.stringify(
						{
							target: {
								title: target.title,
								url: target.url,
							},
							before: beforeMetrics,
							after: afterMetrics,
						},
						null,
						2,
					)}\n`,
				);
				return { profilePath, metricsPath };
			},
		};
	} catch (error) {
		console.warn(`CDP capture disabled: ${String(error)}`);
		return null;
	}
}

function summarizeStatus(
	status: Awaited<ReturnType<typeof gitStatusSnapshotTask.handler>>["snapshot"],
): ScenarioResult["statusSummary"] {
	return {
		againstBase: status.againstBase.length,
		staged: status.staged.length,
		unstaged: status.unstaged.length,
		ignoredPaths: status.ignoredPaths.length,
	};
}

function createProfileGitEnv({
	gitLogPath,
	gitDelayMs,
	realGitBinary,
	wrapperDir,
}: {
	gitLogPath: string;
	gitDelayMs: number;
	realGitBinary: string;
	wrapperDir: string;
}): Record<string, string> {
	const inheritedEnv = Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
	return {
		...inheritedEnv,
		GIT_OPTIONAL_LOCKS: "0",
		GIT_PROFILE_DELAY_SECONDS: (gitDelayMs / 1000).toFixed(3),
		GIT_PROFILE_LOG: gitLogPath,
		PATH: `${wrapperDir}:${process.env.PATH ?? ""}`,
		REAL_GIT: realGitBinary,
	};
}

function startEventLoopMonitor(): () => ScenarioResult["eventLoopDelayMs"] {
	const histogram = monitorEventLoopDelay({ resolution: 10 });
	histogram.enable();
	return () => {
		histogram.disable();
		const toMs = (nanoseconds: number) =>
			Math.round((nanoseconds / 1_000_000) * 10) / 10;
		return {
			p50: toMs(histogram.percentile(50)),
			p99: toMs(histogram.percentile(99)),
			max: toMs(histogram.max),
		};
	};
}

async function prepareProfileWorktrees(options: Options): Promise<string[]> {
	if (options.workspaces === 1) return [options.repoPath];

	const worktreeRoot = `${options.repoPath}-worktrees`;
	await mkdir(worktreeRoot, { recursive: true });
	const paths: string[] = [];
	for (let index = 0; index < options.workspaces; index++) {
		const worktreePath = join(worktreeRoot, `workspace-${index}`);
		if (!existsSync(join(worktreePath, ".git"))) {
			await run(
				"git",
				["worktree", "add", "--detach", worktreePath, "HEAD"],
				options.repoPath,
			);
		}
		await resetDirtyState(worktreePath);
		await makeDirtyState(worktreePath, options);
		paths.push(worktreePath);
	}
	return paths;
}

function createWorkspaceDb(
	worktreePathByWorkspaceId: Map<string, string>,
): HostDb {
	const workspaceRows = Array.from(
		worktreePathByWorkspaceId,
		([id, worktreePath]) => ({ id, worktreePath }),
	);
	return {
		select: () => ({
			from: () => ({
				all: () => workspaceRows,
			}),
		}),
		query: {
			workspaces: {
				findFirst: (config: unknown) => ({
					sync: () => {
						const chunks = (
							config as {
								where?: { queryChunks?: Array<{ value?: unknown }> };
							}
						).where?.queryChunks;
						const workspaceId = chunks?.find(
							(chunk) =>
								typeof chunk.value === "string" &&
								worktreePathByWorkspaceId.has(chunk.value),
						)?.value;
						return typeof workspaceId === "string"
							? {
									id: workspaceId,
									worktreePath:
										worktreePathByWorkspaceId.get(workspaceId) ?? "",
								}
							: undefined;
					},
				}),
			},
		},
	} as unknown as HostDb;
}

async function connectCdp(webSocketUrl: string): Promise<{
	send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
	close: () => void;
}> {
	const socket = new WebSocket(webSocketUrl);
	let id = 0;
	let closed = false;
	const pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (reason: unknown) => void;
		}
	>();

	const rejectPending = (error: Error) => {
		closed = true;
		for (const request of pending.values()) {
			request.reject(error);
		}
		pending.clear();
	};

	socket.addEventListener("message", (event) => {
		const message = JSON.parse(String(event.data)) as {
			id?: number;
			result?: unknown;
			error?: unknown;
		};
		if (!message.id) return;
		const request = pending.get(message.id);
		if (!request) return;
		pending.delete(message.id);
		if (message.error) request.reject(message.error);
		else request.resolve(message.result);
	});
	socket.addEventListener("close", () => {
		rejectPending(new Error("CDP socket closed"));
	});
	socket.addEventListener("error", (event) => {
		rejectPending(new Error(`CDP socket error: ${event.type}`));
	});

	await new Promise<void>((resolveOpen, rejectOpen) => {
		socket.addEventListener("open", () => resolveOpen(), { once: true });
		socket.addEventListener(
			"error",
			(event) => rejectOpen(new Error(`CDP socket error: ${event.type}`)),
			{ once: true },
		);
	});

	return {
		send: (method, params = {}) =>
			new Promise((resolveSend, rejectSend) => {
				if (closed || socket.readyState !== WebSocket.OPEN) {
					rejectSend(new Error("CDP socket is not open"));
					return;
				}
				const requestId = ++id;
				pending.set(requestId, {
					resolve: resolveSend,
					reject: rejectSend,
				});
				try {
					socket.send(JSON.stringify({ id: requestId, method, params }));
				} catch (error) {
					pending.delete(requestId);
					rejectSend(error);
				}
			}),
		close: () => {
			rejectPending(new Error("CDP socket closed by profiler"));
			socket.close();
		},
	};
}

async function installGitWrapper(
	wrapperDir: string,
	logPath: string,
	realGit: string,
): Promise<void> {
	await mkdir(wrapperDir, { recursive: true });
	await writeFile(
		join(wrapperDir, "git"),
		[
			"#!/bin/sh",
			'printf "start\\t%s\\t%s\\n" "$$" "$*" >> "$GIT_PROFILE_LOG"',
			'if [ -n "$GIT_PROFILE_DELAY_SECONDS" ] && [ "$GIT_PROFILE_DELAY_SECONDS" != "0.000" ]; then sleep "$GIT_PROFILE_DELAY_SECONDS"; fi',
			'"$REAL_GIT" "$@"',
			"status=$?",
			'printf "end\\t%s\\t%s\\n" "$$" "$status" >> "$GIT_PROFILE_LOG"',
			'exit "$status"',
			"",
		].join("\n"),
	);
	chmodSync(join(wrapperDir, "git"), 0o755);
	await writeFile(logPath, "");
	process.env.REAL_GIT = realGit;
}

async function parseGitLog(logPath: string): Promise<{
	invocations: number;
	maxActive: number;
	topCommands: Array<{ command: string; count: number }>;
}> {
	const raw = await readFile(logPath, "utf8").catch(() => "");
	let active = 0;
	let maxActive = 0;
	let invocations = 0;
	const commands = new Map<string, number>();

	for (const line of raw.split("\n")) {
		if (!line) continue;
		const [type, , rest = ""] = line.split("\t");
		if (type === "start") {
			active++;
			invocations++;
			maxActive = Math.max(maxActive, active);
			const command = summarizeGitCommand(rest);
			commands.set(command, (commands.get(command) ?? 0) + 1);
		} else if (type === "end") {
			active = Math.max(0, active - 1);
		}
	}

	return {
		invocations,
		maxActive,
		topCommands: Array.from(commands.entries())
			.map(([command, count]) => ({ command, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 12),
	};
}

function summarizeGitCommand(args: string): string {
	const parts = args.split(" ").filter(Boolean);
	const command = parts[0] ?? "(unknown)";
	if (command === "diff") {
		return ["diff", ...parts.filter((part) => part.startsWith("--"))].join(" ");
	}
	if (command === "config") return `config ${parts[1] ?? ""}`.trim();
	if (command === "rev-parse") return `rev-parse ${parts[1] ?? ""}`.trim();
	return command;
}

async function mutateChurnFilesInChild(
	repoPaths: string[],
	events: number,
	eventIntervalMs: number,
	files: number,
): Promise<void> {
	const script = [
		'import { writeFile } from "node:fs/promises";',
		'import { join } from "node:path";',
		"const [repoPathsRaw, eventsRaw, intervalRaw, filesRaw] = process.argv.slice(1);",
		"const repoPaths = JSON.parse(repoPathsRaw);",
		"const events = Number(eventsRaw);",
		"const interval = Number(intervalRaw);",
		"const files = Number(filesRaw);",
		"for (let event = 0; event < events; event++) {",
		"  const id = event % files;",
		"  const bucket = String(Math.floor(id / 1000)).padStart(4, '0');",
		"  const file = String(id).padStart(6, '0');",
		"  await Promise.all(repoPaths.map((repoPath, workspace) => writeFile(",
		"    join(repoPath, 'src', bucket, 'file-' + file + '.ts'),",
		"    'export const value' + id + ' = ' + id + ';\\nexport const churn' + workspace + ' = ' + event + ';\\n',",
		"  )));",
		"  if (interval > 0) await new Promise((resolve) => setTimeout(resolve, interval));",
		"}",
	].join("\n");
	await run(
		process.execPath,
		[
			"--eval",
			script,
			JSON.stringify(repoPaths),
			String(events),
			String(eventIntervalMs),
			String(files),
		],
		process.cwd(),
	);
}

function trackedFilePath(repoPath: string, id: number): string {
	const bucket = String(Math.floor(id / 1_000)).padStart(4, "0");
	const file = String(id).padStart(6, "0");
	return join(repoPath, "src", bucket, `file-${file}.ts`);
}

async function writeTextFile(path: string, contents: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
}

async function commandOutput(command: string, args: string[]): Promise<string> {
	const output: Buffer[] = [];
	await run(command, args, process.cwd(), undefined, (chunk) => {
		output.push(chunk);
	});
	return Buffer.concat(output).toString("utf8");
}

async function run(
	command: string,
	args: string[],
	cwd: string,
	env?: NodeJS.ProcessEnv,
	onStdout?: (chunk: Buffer) => void,
): Promise<void> {
	await new Promise<void>((resolveRun, rejectRun) => {
		const child = spawn(command, args, {
			cwd,
			env: env ? { ...process.env, ...env } : process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => onStdout?.(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", rejectRun);
		child.on("close", (code) => {
			if (code === 0) {
				resolveRun();
				return;
			}
			rejectRun(
				new Error(
					`${command} ${args.join(" ")} exited ${code}: ${Buffer.concat(
						stderr,
					).toString("utf8")}`,
				),
			);
		});
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

await main();
