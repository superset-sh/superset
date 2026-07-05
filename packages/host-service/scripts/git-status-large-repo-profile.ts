import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { HostDb } from "../src/db";
import { EventBus } from "../src/events/event-bus";
import { GitWatcher } from "../src/events/git-watcher";
import type { ServerMessage } from "../src/events/types";
import { WorkspaceFilesystemManager } from "../src/runtime/filesystem";
import { createUserSimpleGit } from "../src/runtime/git/simple-git";
import { gitRouter } from "../src/trpc/router/git/git";
import { getGitStatusSnapshot } from "../src/trpc/router/git/utils/git-status";
import {
	GitStatusRefreshLimiter,
	gitStatusRefreshLimiter,
} from "../src/trpc/router/git/utils/git-status-refresh-limiter";
import type { HostServiceContext } from "../src/types";

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
	gitDelayMs: number;
	mode: Mode | "both";
	flow: Flow;
	recreate: boolean;
	cdpPort: number | null;
}

interface ScenarioResult {
	flow: Flow;
	mode: Mode;
	requestedRefreshes: number;
	worktreeMutations?: number;
	gitChangedEvents?: number;
	actualRefreshes: number;
	durationMs: number;
	maxActiveRefreshes: number;
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

function parseArgs(argv: string[]): Options {
	const options: Options = {
		repoPath: resolve(DEFAULT_REPO_PATH),
		outDir: resolve(DEFAULT_OUT_DIR),
		files: 20_000,
		dirty: 600,
		events: 60,
		eventIntervalMs: 50,
		concurrency: 4,
		gitDelayMs: 0,
		mode: "both",
		flow: "compute",
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
  --git-delay-ms <n>           Artificial delay before each git subprocess.
                               Useful for modeling EDR/exec overhead.
  --mode <limited|unbounded|both>
  --flow <compute|event-bus>   compute stresses getStatus directly; event-bus
                               runs GitWatcher → EventBus → client refresh.
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
	const startedAt = performance.now();
	const promises: Array<Promise<unknown>> = [];

	const runRefresh = async () => {
		actualRefreshes++;
		activeRefreshes++;
		maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
		try {
			const git = createUserSimpleGit(options.repoPath).env({
				...process.env,
				GIT_OPTIONAL_LOCKS: "0",
				GIT_PROFILE_DELAY_SECONDS: (options.gitDelayMs / 1000).toFixed(3),
				GIT_PROFILE_LOG: gitLogPath,
				PATH: `${wrapperDir}:${process.env.PATH ?? ""}`,
				REAL_GIT: realGitBinary,
			});
			const status = await getGitStatusSnapshot({
				git,
				worktreePath: options.repoPath,
			});
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

	for (let event = 0; event < options.events; event++) {
		await mutateChurnFile(options.repoPath, event);
		const promise =
			mode === "limited"
				? limiter.run({
						workspaceId: "large-repo",
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

	return {
		flow: "compute",
		mode,
		requestedRefreshes: options.events,
		actualRefreshes,
		durationMs: Math.round(performance.now() - startedAt),
		maxActiveRefreshes,
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
	const workspaceId = "large-repo";
	const gitLogPath = join(options.outDir, `${label}-git.log`);
	const wrapperDir = join(options.outDir, `${label}-bin`);
	const realGit = await commandOutput("git", ["--exec-path"]);
	const realGitBinary = join(realGit.trim(), "git");
	await installGitWrapper(wrapperDir, gitLogPath, realGitBinary);

	const db = createSingleWorkspaceDb(workspaceId, options.repoPath);
	const filesystem = new WorkspaceFilesystemManager({ db });
	const gitWatcher = new GitWatcher(db, filesystem);
	const eventBus = new EventBus({ db, filesystem, gitWatcher });
	const refreshPromises: Array<Promise<unknown>> = [];
	let gitChangedEvents = 0;
	let actualRefreshes = 0;
	let activeRefreshes = 0;
	let maxActiveRefreshes = 0;
	let lastSummary: ScenarioResult["statusSummary"] | null = null;

	const createProfiledGit = (worktreePath: string) =>
		createUserSimpleGit(worktreePath).env({
			...process.env,
			GIT_OPTIONAL_LOCKS: "0",
			GIT_PROFILE_DELAY_SECONDS: (options.gitDelayMs / 1000).toFixed(3),
			GIT_PROFILE_LOG: gitLogPath,
			PATH: `${wrapperDir}:${process.env.PATH ?? ""}`,
			REAL_GIT: realGitBinary,
		});

	const runRefresh = async () => {
		actualRefreshes++;
		activeRefreshes++;
		maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
		try {
			const status = await getGitStatusSnapshot({
				git: createProfiledGit(options.repoPath),
				worktreePath: options.repoPath,
			});
			lastSummary = summarizeStatus(status);
			return status;
		} finally {
			activeRefreshes--;
		}
	};

	const runLimitedRefresh = async () => {
		let counted = false;
		const caller = gitRouter.createCaller(
			createRouterContext({
				db,
				eventBus,
				filesystem,
				git: async (worktreePath) => {
					if (!counted) {
						counted = true;
						actualRefreshes++;
						activeRefreshes++;
						maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes);
					}
					return createProfiledGit(worktreePath);
				},
			}),
		);
		try {
			const status = await caller.getStatus({ workspaceId });
			lastSummary = summarizeStatus(status);
			return status;
		} finally {
			if (counted) activeRefreshes--;
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
				message.workspaceId !== workspaceId
			) {
				return;
			}
			gitChangedEvents++;
			const promise = mode === "limited" ? runLimitedRefresh() : runRefresh();
			if (promise) refreshPromises.push(promise);
		},
		close: () => {
			socket.readyState = 3;
		},
	};

	const startedAt = performance.now();
	gitStatusRefreshLimiter.clear();
	eventBus.start();
	eventBus.handleOpen(socket);
	await (gitWatcher as unknown as { rescan: () => Promise<void> }).rescan();

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
		for (let event = 0; event < options.events; event++) {
			await mutateChurnFile(options.repoPath, event);
			if (options.eventIntervalMs > 0) {
				await sleep(options.eventIntervalMs);
			}
		}

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
		return {
			flow: "event-bus",
			mode,
			requestedRefreshes: gitChangedEvents,
			worktreeMutations: options.events,
			gitChangedEvents,
			actualRefreshes,
			durationMs: Math.round(performance.now() - startedAt),
			maxActiveRefreshes,
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
	status: Awaited<ReturnType<typeof getGitStatusSnapshot>>,
): ScenarioResult["statusSummary"] {
	return {
		againstBase: status.againstBase.length,
		staged: status.staged.length,
		unstaged: status.unstaged.length,
		ignoredPaths: status.ignoredPaths.length,
	};
}

function createSingleWorkspaceDb(
	workspaceId: string,
	worktreePath: string,
): HostDb {
	const workspace = { id: workspaceId, worktreePath };
	return {
		select: () => ({
			from: () => ({
				all: () => [workspace],
			}),
		}),
		query: {
			workspaces: {
				findFirst: () => ({
					sync: () => workspace,
				}),
			},
		},
	} as unknown as HostDb;
}

function createRouterContext({
	db,
	eventBus,
	filesystem,
	git,
}: {
	db: HostDb;
	eventBus: EventBus;
	filesystem: WorkspaceFilesystemManager;
	git: HostServiceContext["git"];
}): HostServiceContext {
	return {
		api: {} as HostServiceContext["api"],
		db,
		eventBus,
		execGh: (() => {
			throw new Error("execGh is not used by git-status profiling");
		}) as HostServiceContext["execGh"],
		git,
		github: (async () => {
			throw new Error("github is not used by git-status profiling");
		}) as HostServiceContext["github"],
		isAuthenticated: true,
		organizationId: "profile-org",
		runtime: {
			filesystem,
		} as HostServiceContext["runtime"],
	};
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

async function mutateChurnFile(repoPath: string, event: number): Promise<void> {
	await writeTextFile(
		join(repoPath, "churn", `event-${event % 20}.txt`),
		`event ${event} at ${new Date().toISOString()}\n`,
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
