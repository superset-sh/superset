import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { DesktopAutomation } from "../../../packages/desktop-mcp/src/automation/index.ts";
import {
	STARTUP_PERFORMANCE_GET_CHANNEL,
	type StartupPerformanceReport,
} from "../src/shared/startup-performance";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

type ProcessRole =
	| "desktop-dev-runner"
	| "electron-main"
	| "electron-renderer"
	| "electron-gpu"
	| "electron-network"
	| "electron-utility"
	| "host-service"
	| "pty-daemon"
	| "terminal-host"
	| "api"
	| "electric-proxy"
	| "workerd"
	| "other-service"
	| "other";

interface CliOptions {
	durationMs: number;
	intervalMs: number;
	topLimit: number;
	reportDir: string;
	markdownOut?: string;
	jsonOut?: string;
	routes: string[];
	routeSettleMs: number;
	restoreRoute: boolean;
	automation: boolean;
}

interface ProcessRow {
	pid: number;
	ppid: number;
	cpu: number;
	rssBytes: number;
	memoryBytes: number;
	command: string;
}

interface GroupMetrics {
	role: ProcessRole;
	count: number;
	cpu: number;
	memoryBytes: number;
}

interface ProcessPoint {
	pid: number;
	ppid: number;
	role: ProcessRole;
	cpu: number;
	memoryBytes: number;
	command: string;
}

interface ProcessSample {
	sampledAt: string;
	elapsedMs: number;
	desktop: GroupMetrics;
	services: GroupMetrics;
	all: GroupMetrics;
	groups: GroupMetrics[];
	processes: ProcessPoint[];
}

interface GroupSummary {
	role: ProcessRole;
	maxCount: number;
	avgCpu: number;
	maxCpu: number;
	avgMemoryBytes: number;
	maxMemoryBytes: number;
}

interface ProcessSummary {
	pid: number;
	role: ProcessRole;
	samples: number;
	avgCpu: number;
	maxCpu: number;
	maxMemoryBytes: number;
	latestMemoryBytes: number;
	command: string;
}

interface WindowInfo {
	title: string;
	url: string;
	viewportWidth: number;
	viewportHeight: number;
	focused: boolean;
}

interface RendererMetrics {
	href: string;
	title: string;
	readyState: string;
	visibilityState: string;
	nodeCount: number;
	scriptCount: number;
	stylesheetCount: number;
	resourceCount: number;
	usedJsHeapSize?: number;
	totalJsHeapSize?: number;
	jsHeapSizeLimit?: number;
	navigation?: {
		type?: string;
		durationMs?: number;
		domContentLoadedMs?: number;
		loadEventMs?: number;
		responseEndMs?: number;
	};
	paint: Array<{ name: string; startTimeMs: number }>;
	largestResources: Array<{
		name: string;
		initiatorType: string;
		durationMs: number;
		transferSize?: number;
		decodedBodySize?: number;
	}>;
	longTasks: Array<{ durationMs: number; startTimeMs: number }>;
}

interface ConsoleLogEntry {
	level: number;
	message: string;
	timestamp: number;
}

interface RouteMeasurement {
	path: string;
	startedAt: string;
	navigationMode?: string;
	href?: string;
	durationMs?: number;
	renderer?: RendererMetrics;
	error?: string;
}

interface AutomationSnapshot {
	windowInfo?: WindowInfo;
	renderer?: RendererMetrics;
	consoleErrors: ConsoleLogEntry[];
	error?: string;
}

interface StartupSnapshot {
	report?: StartupPerformanceReport;
	error?: string;
}

interface RuntimeReport {
	generatedAt: string;
	options: CliOptions;
	startup: StartupSnapshot;
	automation: AutomationSnapshot;
	routeMeasurements: RouteMeasurement[];
	processSummary: {
		sampleCount: number;
		durationMs: number;
		desktop: GroupSummary;
		services: GroupSummary;
		all: GroupSummary;
		groups: GroupSummary[];
		topByMemory: ProcessSummary[];
		topByCpu: ProcessSummary[];
	};
	samples: ProcessSample[];
	outputs: {
		markdownPath: string;
		jsonPath: string;
	};
}

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "../..");
const taskArtifactsDir = resolve(
	rootDir,
	".trellis/tasks/06-09-desktop-performance-packaging-optimization/artifacts",
);
const defaultDurationMs = 10_000;
const defaultIntervalMs = 1_000;
const execTimeoutMs = 15_000;
const maxBuffer = 20 * 1024 * 1024;

process.env.DESKTOP_AUTOMATION_PORT ??= "9322";

let getPhysFootprints: ((pids: number[]) => Record<number, number>) | undefined;
try {
	const metricsModule = require("@superset/macos-process-metrics") as {
		getPhysFootprints?: unknown;
	};
	if (typeof metricsModule.getPhysFootprints === "function") {
		getPhysFootprints = metricsModule.getPhysFootprints as (
			pids: number[],
		) => Record<number, number>;
	}
} catch {
	getPhysFootprints = undefined;
}

function parseCliOptions(argv: string[]): CliOptions {
	const options: CliOptions = {
		durationMs: defaultDurationMs,
		intervalMs: defaultIntervalMs,
		topLimit: 12,
		reportDir: taskArtifactsDir,
		routes: [],
		routeSettleMs: 750,
		restoreRoute: true,
		automation: true,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith("--")) continue;

		const equalsIndex = arg.indexOf("=");
		const name = equalsIndex === -1 ? arg.slice(2) : arg.slice(2, equalsIndex);
		const inlineValue =
			equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);
		const nextValue = () => {
			if (inlineValue !== undefined) return inlineValue;
			index += 1;
			const value = argv[index];
			if (!value || value.startsWith("--")) {
				throw new Error(`--${name} requires a value`);
			}
			return value;
		};

		switch (name) {
			case "duration":
			case "duration-ms":
				options.durationMs = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "interval":
			case "interval-ms":
				options.intervalMs = parsePositiveInteger(nextValue(), name);
				break;
			case "top":
				options.topLimit = parsePositiveInteger(nextValue(), name);
				break;
			case "report-dir":
				options.reportDir = resolveWorkspacePath(nextValue());
				break;
			case "markdown-out":
				options.markdownOut = resolveWorkspacePath(nextValue());
				break;
			case "json-out":
				options.jsonOut = resolveWorkspacePath(nextValue());
				break;
			case "route":
				options.routes.push(normalizeRoutePath(nextValue()));
				break;
			case "route-settle":
			case "route-settle-ms":
				options.routeSettleMs = parsePositiveInteger(nextValue(), name, {
					allowZero: true,
				});
				break;
			case "restore-route":
				options.restoreRoute = parseBoolean(nextValue(), name);
				break;
			case "no-restore-route":
				options.restoreRoute = false;
				break;
			case "automation":
				options.automation = parseBoolean(nextValue(), name);
				break;
			case "no-automation":
				options.automation = false;
				break;
			default:
				throw new Error(`Unknown option --${name}`);
		}
	}

	if (options.durationMs > 0 && options.durationMs < options.intervalMs) {
		options.intervalMs = options.durationMs;
	}

	return options;
}

function parsePositiveInteger(
	value: string,
	name: string,
	{ allowZero = false }: { allowZero?: boolean } = {},
): number {
	const parsed = Number.parseInt(value, 10);
	const minimum = allowZero ? 0 : 1;
	if (!Number.isFinite(parsed) || parsed < minimum) {
		throw new Error(
			`--${name} must be ${allowZero ? "0 or greater" : "positive"}`,
		);
	}
	return parsed;
}

function parseBoolean(value: string, name: string): boolean {
	if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
	if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
	throw new Error(`--${name} must be true or false`);
}

function resolveWorkspacePath(path: string): string {
	const resolvedPath = isAbsolute(path)
		? resolve(path)
		: resolve(rootDir, path);
	if (resolvedPath !== rootDir && !resolvedPath.startsWith(`${rootDir}/`)) {
		throw new Error(`Output path must stay inside this repository: ${path}`);
	}
	return resolvedPath;
}

function normalizeRoutePath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) throw new Error("--route cannot be empty");
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function timestampForFile(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatMs(ms: number | undefined): string {
	if (ms === undefined || !Number.isFinite(ms)) return "n/a";
	if (ms < 1000) return `${Math.round(ms)} ms`;
	return `${(ms / 1000).toFixed(2)} s`;
}

function formatCpu(value: number): string {
	return `${value.toFixed(1)}%`;
}

function trimCommand(command: string, limit = 160): string {
	const normalized = command.replaceAll(rootDir, "<repo>");
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, limit - 1)}...`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function listProcesses(): Promise<ProcessRow[]> {
	const { stdout } = await execFileAsync(
		"ps",
		["-axo", "pid=,ppid=,pcpu=,rss=,command="],
		{ maxBuffer, timeout: execTimeoutMs },
	);
	const rows: ProcessRow[] = [];
	for (const line of stdout.split("\n")) {
		const match = line
			.trim()
			.match(/^(\d+)\s+(\d+)\s+([0-9.]+)\s+(\d+)\s+(.+)$/);
		if (!match) continue;
		const pid = Number.parseInt(match[1], 10);
		const ppid = Number.parseInt(match[2], 10);
		const cpu = Number.parseFloat(match[3]);
		const rssKb = Number.parseInt(match[4], 10);
		const command = match[5];
		if (
			!Number.isFinite(pid) ||
			!Number.isFinite(ppid) ||
			!Number.isFinite(cpu) ||
			!Number.isFinite(rssKb)
		) {
			continue;
		}
		rows.push({
			pid,
			ppid,
			cpu: Math.max(0, cpu),
			rssBytes: Math.max(0, rssKb) * 1024,
			memoryBytes: Math.max(0, rssKb) * 1024,
			command,
		});
	}
	return rows;
}

function createChildrenMap(rows: ProcessRow[]): Map<number, number[]> {
	const children = new Map<number, number[]>();
	for (const row of rows) {
		const existing = children.get(row.ppid);
		if (existing) {
			existing.push(row.pid);
		} else {
			children.set(row.ppid, [row.pid]);
		}
	}
	return children;
}

function collectSubtreePids(
	seedPids: Iterable<number>,
	childrenByParent: Map<number, number[]>,
): Set<number> {
	const result = new Set<number>();
	const stack = [...seedPids];
	while (stack.length > 0) {
		const pid = stack.pop();
		if (pid === undefined || result.has(pid)) continue;
		result.add(pid);
		for (const child of childrenByParent.get(pid) ?? []) {
			stack.push(child);
		}
	}
	return result;
}

function findDesktopSeedPids(rows: ProcessRow[]): number[] {
	return rows
		.filter((row) => {
			const command = row.command;
			return (
				command.includes("bun run --cwd apps/desktop dev") ||
				command.includes(`${desktopDir}/node_modules/.bin/electron-vite`) ||
				command.includes("electron-vite dev --watch") ||
				command.includes("/Superset.app/Contents/MacOS/Superset") ||
				command.includes("/Superset Canary.app/Contents/MacOS/Superset")
			);
		})
		.map((row) => row.pid);
}

function findServiceSeedPids(rows: ProcessRow[]): number[] {
	return rows
		.filter((row) => {
			const command = row.command;
			return (
				command.includes("bun run --cwd apps/api dev") ||
				command.includes("bun run --cwd apps/electric-proxy dev") ||
				command.includes(`${rootDir}/apps/api`) ||
				command.includes(`${rootDir}/apps/electric-proxy`) ||
				command.includes("wrangler dev --port") ||
				command.includes("workerd serve --binary")
			);
		})
		.map((row) => row.pid);
}

function classifyProcess(row: ProcessRow): ProcessRole {
	const command = row.command;
	if (command.includes("host-service.js")) return "host-service";
	if (command.includes("pty-daemon.js")) return "pty-daemon";
	if (command.includes("terminal-host.js")) return "terminal-host";
	if (command.includes("--type=renderer")) return "electron-renderer";
	if (command.includes("--type=gpu-process")) return "electron-gpu";
	if (command.includes("--utility-sub-type=network")) return "electron-network";
	if (command.includes("--type=utility")) return "electron-utility";
	if (command.includes("Electron.app/Contents/MacOS/Electron")) {
		return "electron-main";
	}
	if (
		command.includes("bun run --cwd apps/desktop dev") ||
		command.includes("electron-vite dev --watch") ||
		command.includes(`${desktopDir}/node_modules/.bin/electron-vite`)
	) {
		return "desktop-dev-runner";
	}
	if (
		command.includes("bun run --cwd apps/api dev") ||
		command.includes(`${rootDir}/apps/api`)
	) {
		return "api";
	}
	if (
		command.includes("bun run --cwd apps/electric-proxy dev") ||
		command.includes(`${rootDir}/apps/electric-proxy`) ||
		command.includes("wrangler dev --port")
	) {
		return "electric-proxy";
	}
	if (command.includes("workerd serve --binary")) return "workerd";
	return "other";
}

function roleSortValue(role: ProcessRole): number {
	const order: ProcessRole[] = [
		"electron-renderer",
		"electron-main",
		"host-service",
		"pty-daemon",
		"terminal-host",
		"electron-gpu",
		"electron-network",
		"electron-utility",
		"desktop-dev-runner",
		"api",
		"electric-proxy",
		"workerd",
		"other-service",
		"other",
	];
	return order.indexOf(role) === -1 ? order.length : order.indexOf(role);
}

function enrichWithMacosFootprint(rows: ProcessRow[], pids: Set<number>): void {
	if (!getPhysFootprints || pids.size === 0) return;
	try {
		const footprints = getPhysFootprints([...pids]);
		for (const row of rows) {
			if (!pids.has(row.pid)) continue;
			const footprint = footprints[row.pid];
			if (typeof footprint === "number" && footprint > 0) {
				row.memoryBytes = footprint;
			}
		}
	} catch {
		// Keep RSS fallback.
	}
}

function aggregateGroup(
	role: ProcessRole,
	processes: ProcessPoint[],
): GroupMetrics {
	return processes.reduce<GroupMetrics>(
		(total, process) => ({
			role,
			count: total.count + 1,
			cpu: total.cpu + process.cpu,
			memoryBytes: total.memoryBytes + process.memoryBytes,
		}),
		{ role, count: 0, cpu: 0, memoryBytes: 0 },
	);
}

async function captureProcessSample(
	startedAtMs: number,
): Promise<ProcessSample> {
	const rows = await listProcesses();
	const childrenByParent = createChildrenMap(rows);
	const desktopPids = collectSubtreePids(
		findDesktopSeedPids(rows),
		childrenByParent,
	);
	const servicePids = collectSubtreePids(
		findServiceSeedPids(rows),
		childrenByParent,
	);
	const relevantPids = new Set([...desktopPids, ...servicePids]);

	enrichWithMacosFootprint(rows, relevantPids);

	const processes = rows
		.filter((row) => relevantPids.has(row.pid))
		.map<ProcessPoint>((row) => ({
			pid: row.pid,
			ppid: row.ppid,
			role: classifyProcess(row),
			cpu: row.cpu,
			memoryBytes: row.memoryBytes,
			command: row.command,
		}));
	const desktopProcesses = processes.filter((process) =>
		desktopPids.has(process.pid),
	);
	const serviceProcesses = processes.filter(
		(process) => servicePids.has(process.pid) && !desktopPids.has(process.pid),
	);
	const grouped = new Map<ProcessRole, ProcessPoint[]>();
	for (const process of processes) {
		const existing = grouped.get(process.role);
		if (existing) {
			existing.push(process);
		} else {
			grouped.set(process.role, [process]);
		}
	}

	return {
		sampledAt: new Date().toISOString(),
		elapsedMs: Date.now() - startedAtMs,
		desktop: aggregateGroup("other", desktopProcesses),
		services: aggregateGroup("other-service", serviceProcesses),
		all: aggregateGroup("other", processes),
		groups: [...grouped.entries()]
			.map(([role, groupProcesses]) => aggregateGroup(role, groupProcesses))
			.sort(
				(left, right) => roleSortValue(left.role) - roleSortValue(right.role),
			),
		processes,
	};
}

async function captureProcessSamples(
	options: CliOptions,
): Promise<ProcessSample[]> {
	const samples: ProcessSample[] = [];
	const startedAtMs = Date.now();
	do {
		samples.push(await captureProcessSample(startedAtMs));
		const elapsedMs = Date.now() - startedAtMs;
		if (options.durationMs === 0 || elapsedMs >= options.durationMs) break;
		await sleep(Math.min(options.intervalMs, options.durationMs - elapsedMs));
	} while (Date.now() - startedAtMs < options.durationMs);
	return samples;
}

function summarizeGroup(
	role: ProcessRole,
	samples: ProcessSample[],
	select: (sample: ProcessSample) => GroupMetrics | undefined,
): GroupSummary {
	const metrics = samples
		.map(select)
		.map((metric) => metric ?? { role, count: 0, cpu: 0, memoryBytes: 0 });
	return {
		role,
		maxCount: Math.max(0, ...metrics.map((metric) => metric.count)),
		avgCpu: average(metrics.map((metric) => metric.cpu)),
		maxCpu: Math.max(0, ...metrics.map((metric) => metric.cpu)),
		avgMemoryBytes: average(metrics.map((metric) => metric.memoryBytes)),
		maxMemoryBytes: Math.max(0, ...metrics.map((metric) => metric.memoryBytes)),
	};
}

function summarizeProcesses(samples: ProcessSample[]): ProcessSummary[] {
	const byPid = new Map<
		number,
		{
			role: ProcessRole;
			command: string;
			cpuValues: number[];
			memoryValues: number[];
		}
	>();
	for (const sample of samples) {
		for (const process of sample.processes) {
			const existing = byPid.get(process.pid);
			if (existing) {
				existing.role = process.role;
				existing.command = process.command;
				existing.cpuValues.push(process.cpu);
				existing.memoryValues.push(process.memoryBytes);
			} else {
				byPid.set(process.pid, {
					role: process.role,
					command: process.command,
					cpuValues: [process.cpu],
					memoryValues: [process.memoryBytes],
				});
			}
		}
	}
	return [...byPid.entries()].map(([pid, info]) => ({
		pid,
		role: info.role,
		samples: info.cpuValues.length,
		avgCpu: average(info.cpuValues),
		maxCpu: Math.max(0, ...info.cpuValues),
		maxMemoryBytes: Math.max(0, ...info.memoryValues),
		latestMemoryBytes: info.memoryValues.at(-1) ?? 0,
		command: info.command,
	}));
}

function summarizeSamples(
	samples: ProcessSample[],
	topLimit: number,
): RuntimeReport["processSummary"] {
	const roles = new Set<ProcessRole>();
	for (const sample of samples) {
		for (const group of sample.groups) roles.add(group.role);
	}
	const processSummaries = summarizeProcesses(samples);
	return {
		sampleCount: samples.length,
		durationMs: samples.at(-1)?.elapsedMs ?? 0,
		desktop: summarizeGroup("other", samples, (sample) => sample.desktop),
		services: summarizeGroup(
			"other-service",
			samples,
			(sample) => sample.services,
		),
		all: summarizeGroup("other", samples, (sample) => sample.all),
		groups: [...roles]
			.map((role) =>
				summarizeGroup(role, samples, (sample) =>
					sample.groups.find((group) => group.role === role),
				),
			)
			.sort(
				(left, right) => roleSortValue(left.role) - roleSortValue(right.role),
			),
		topByMemory: [...processSummaries]
			.sort((left, right) => right.maxMemoryBytes - left.maxMemoryBytes)
			.slice(0, topLimit),
		topByCpu: [...processSummaries]
			.sort((left, right) => right.avgCpu - left.avgCpu)
			.slice(0, topLimit),
	};
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseJsonFromOutput<T>(output: string): T {
	const trimmed = output.trim();
	const objectStart = trimmed.indexOf("{");
	const arrayStart = trimmed.indexOf("[");
	const start =
		objectStart === -1
			? arrayStart
			: arrayStart === -1
				? objectStart
				: Math.min(objectStart, arrayStart);
	if (start === -1) {
		throw new Error(
			`No JSON payload found in output: ${trimmed.slice(0, 120)}`,
		);
	}
	const endObject = trimmed.lastIndexOf("}");
	const endArray = trimmed.lastIndexOf("]");
	const end = Math.max(endObject, endArray);
	if (end < start) {
		throw new Error(`Incomplete JSON payload: ${trimmed.slice(0, 120)}`);
	}
	return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

function parseAutomationJson<T>(value: unknown): T {
	if (typeof value === "string") return parseJsonFromOutput<T>(value);
	return value as T;
}

const rendererMetricsScript = `(() => {
	const navigation = performance.getEntriesByType("navigation")[0];
	const paints = performance.getEntriesByType("paint");
	const resources = performance.getEntriesByType("resource");
	const longTasks = performance.getEntriesByType("longtask");
	const memory = performance.memory || {};
	return JSON.stringify({
		href: location.href,
		title: document.title,
		readyState: document.readyState,
		visibilityState: document.visibilityState,
		nodeCount: document.querySelectorAll("*").length,
		scriptCount: document.scripts.length,
		stylesheetCount: document.styleSheets.length,
		resourceCount: resources.length,
		usedJsHeapSize: memory.usedJSHeapSize,
		totalJsHeapSize: memory.totalJSHeapSize,
		jsHeapSizeLimit: memory.jsHeapSizeLimit,
		navigation: navigation ? {
			type: navigation.type,
			durationMs: navigation.duration,
			domContentLoadedMs: navigation.domContentLoadedEventEnd,
			loadEventMs: navigation.loadEventEnd,
			responseEndMs: navigation.responseEnd,
		} : undefined,
		paint: paints.map((entry) => ({
			name: entry.name,
			startTimeMs: entry.startTime,
		})),
		largestResources: resources
			.map((entry) => ({
				name: entry.name,
				initiatorType: entry.initiatorType,
				durationMs: entry.duration,
				transferSize: entry.transferSize,
				decodedBodySize: entry.decodedBodySize,
			}))
			.sort((left, right) =>
				(right.decodedBodySize || right.transferSize || right.durationMs || 0) -
				(left.decodedBodySize || left.transferSize || left.durationMs || 0)
			)
			.slice(0, 12),
		longTasks: longTasks
			.map((entry) => ({ durationMs: entry.duration, startTimeMs: entry.startTime }))
			.slice(-20),
	});
})()`;

async function captureRendererMetrics(
	automation: DesktopAutomation,
): Promise<RendererMetrics> {
	return parseAutomationJson<RendererMetrics>(
		await automation.evaluateJs(rendererMetricsScript),
	);
}

const startupPerformanceScript = `(() => {
	const ipc = window.ipcRenderer;
	if (!ipc?.invoke) {
		return JSON.stringify({ error: "window.ipcRenderer.invoke unavailable" });
	}
	return ipc.invoke(${JSON.stringify(STARTUP_PERFORMANCE_GET_CHANNEL)})
		.then((report) => JSON.stringify({ report }))
		.catch((error) => JSON.stringify({
			error: error instanceof Error ? error.message : String(error),
		}));
})()`;

async function captureStartupPerformance(
	options: CliOptions,
	automation: DesktopAutomation | null,
): Promise<StartupSnapshot> {
	if (!options.automation || !automation) {
		return { error: "Automation disabled by --no-automation" };
	}

	try {
		return parseAutomationJson<StartupSnapshot>(
			await automation.evaluateJs(startupPerformanceScript),
		);
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function buildRouteSwitchScript(path: string, settleMs: number): string {
	return `(() => new Promise((resolve) => {
		const targetPath = ${JSON.stringify(path)};
		const targetPathname = targetPath.split("?")[0].split("#")[0] || "/";
		const settleMs = ${JSON.stringify(settleMs)};
		const startedAt = performance.now();
		const router = window.__TSR_ROUTER__;
		const currentPath = () =>
			router?.state?.location?.pathname ||
			router?.latestLocation?.pathname ||
			(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash) ||
			"/";
		let mode = "hash";
		const finish = () => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					setTimeout(() => {
						resolve(JSON.stringify({
							href: location.href,
							mode,
							pathname: currentPath(),
							durationMs: performance.now() - startedAt,
						}));
					}, settleMs);
				});
			});
		};
		const waitForPath = () => new Promise((done) => {
			if (currentPath() === targetPathname) {
				done(undefined);
				return;
			}
			let settled = false;
			const complete = () => {
				if (settled) return;
				settled = true;
				if (typeof unsubscribe === "function") unsubscribe();
				clearInterval(interval);
				clearTimeout(timeout);
				done(undefined);
			};
			const check = () => {
				if (currentPath() === targetPathname) complete();
			};
			const unsubscribe = router?.subscribe
				? router.subscribe("onResolved", check)
				: undefined;
			const interval = setInterval(check, 50);
			const timeout = setTimeout(complete, 5000);
			check();
		});
		const run = async () => {
			if (router?.navigate) {
				mode = "tanstack-router";
				await router.navigate({ to: targetPath });
				await waitForPath();
				finish();
				return;
			}
			const targetHash = "#" + targetPath;
			if (window.location.hash === targetHash) {
				finish();
				return;
			}
			window.addEventListener("hashchange", finish, { once: true });
			window.location.hash = targetHash;
			setTimeout(finish, 2000);
		};
		run().catch((error) => {
			resolve(JSON.stringify({
				href: location.href,
				mode,
				pathname: currentPath(),
				durationMs: performance.now() - startedAt,
				error: error instanceof Error ? error.message : String(error),
			}));
		});
	}))()`;
}

async function switchRouteInRenderer(
	automation: DesktopAutomation,
	path: string,
	settleMs: number,
): Promise<{
	href: string;
	mode: string;
	pathname?: string;
	durationMs: number;
	error?: string;
}> {
	return parseAutomationJson<{
		href: string;
		mode: string;
		pathname?: string;
		durationMs: number;
		error?: string;
	}>(await automation.evaluateJs(buildRouteSwitchScript(path, settleMs)));
}

async function captureAutomationSnapshot(
	options: CliOptions,
	automation: DesktopAutomation | null,
): Promise<AutomationSnapshot> {
	if (!options.automation || !automation) {
		return {
			consoleErrors: [],
			error: "Automation disabled by --no-automation",
		};
	}
	try {
		const windowInfo = (await automation.getWindowInfo()) as WindowInfo;
		const renderer = await captureRendererMetrics(automation);
		const consoleErrors = (await automation.getConsoleLogs({
			level: "error",
			limit: 20,
		})) as ConsoleLogEntry[];
		return { windowInfo, renderer, consoleErrors };
	} catch (error) {
		return {
			consoleErrors: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function getHashPath(url: string | undefined): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		const hash = parsed.hash.startsWith("#")
			? parsed.hash.slice(1)
			: parsed.hash;
		return hash ? normalizeRoutePath(hash) : null;
	} catch {
		return null;
	}
}

async function measureRoutes(
	options: CliOptions,
	automation: DesktopAutomation | null,
	originalPath: string | null,
): Promise<RouteMeasurement[]> {
	if (!options.automation || !automation || options.routes.length === 0)
		return [];

	const measurements: RouteMeasurement[] = [];
	for (const route of options.routes) {
		const startedAt = new Date().toISOString();
		try {
			const timing = await switchRouteInRenderer(
				automation,
				route,
				options.routeSettleMs,
			);
			if (timing.error) {
				throw new Error(timing.error);
			}
			const renderer = await captureRendererMetrics(automation);
			measurements.push({
				path: route,
				startedAt,
				navigationMode: timing.mode,
				href: timing.href,
				durationMs: timing.durationMs,
				renderer,
			});
		} catch (error) {
			measurements.push({
				path: route,
				startedAt,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	if (options.restoreRoute && originalPath) {
		try {
			await switchRouteInRenderer(automation, originalPath, 100);
		} catch {
			// Keep the report; route restoration is best-effort.
		}
	}

	return measurements;
}

function markdownTable(headers: string[], rows: string[][]): string {
	const headerRow = `| ${headers.join(" | ")} |`;
	const separator = `| ${headers.map(() => "---").join(" | ")} |`;
	const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
	return [
		headerRow,
		separator,
		body || `| ${headers.map(() => "n/a").join(" | ")} |`,
	].join("\n");
}

function groupSummaryRows(groups: GroupSummary[]): string[][] {
	return groups.map((group) => [
		group.role,
		String(group.maxCount),
		formatCpu(group.avgCpu),
		formatCpu(group.maxCpu),
		formatBytes(group.avgMemoryBytes),
		formatBytes(group.maxMemoryBytes),
	]);
}

function processRows(processes: ProcessSummary[]): string[][] {
	return processes.map((process) => [
		String(process.pid),
		process.role,
		formatCpu(process.avgCpu),
		formatCpu(process.maxCpu),
		formatBytes(process.maxMemoryBytes),
		`\`${trimCommand(process.command).replaceAll("|", "\\|")}\``,
	]);
}

function rendererSummaryRows(
	renderer: RendererMetrics | undefined,
): string[][] {
	if (!renderer) return [];
	const nav = renderer.navigation;
	return [
		["URL", `\`${renderer.href}\``],
		["Ready state", renderer.readyState],
		["DOM nodes", String(renderer.nodeCount)],
		["Scripts", String(renderer.scriptCount)],
		["Stylesheets", String(renderer.stylesheetCount)],
		["Resources", String(renderer.resourceCount)],
		["Navigation duration", formatMs(nav?.durationMs)],
		["DOMContentLoaded", formatMs(nav?.domContentLoadedMs)],
		["Load event", formatMs(nav?.loadEventMs)],
		[
			"JS heap used",
			renderer.usedJsHeapSize ? formatBytes(renderer.usedJsHeapSize) : "n/a",
		],
	];
}

function routeRows(routes: RouteMeasurement[]): string[][] {
	return routes.map((route) => [
		`\`${route.path}\``,
		route.navigationMode ?? "n/a",
		route.durationMs === undefined ? "failed" : formatMs(route.durationMs),
		route.renderer?.href
			? `\`${route.renderer.href}\``
			: route.href
				? `\`${route.href}\``
				: "n/a",
		route.renderer?.nodeCount === undefined
			? "n/a"
			: String(route.renderer.nodeCount),
		route.error
			? `\`${route.error.replaceAll("|", "\\|").slice(0, 160)}\``
			: "",
	]);
}

function startupMarkRows(startup: StartupSnapshot): string[][] {
	const marks = startup.report?.marks;
	if (!marks || marks.length === 0) return [];
	return marks.map((mark) => [
		mark.name,
		formatMs(mark.elapsedMs),
		mark.timestamp,
		mark.detail
			? `\`${JSON.stringify(mark.detail).replaceAll("|", "\\|")}\``
			: "",
	]);
}

function startupDurationRows(startup: StartupSnapshot): string[][] {
	const durations = startup.report?.durations;
	if (!durations || durations.length === 0) return [];
	return durations.map((duration) => [
		`${duration.from} -> ${duration.to}`,
		formatMs(duration.durationMs),
	]);
}

function renderMarkdown(report: RuntimeReport): string {
	const { automation, processSummary } = report;
	const windowInfo = automation.windowInfo;
	const routeSection =
		report.routeMeasurements.length > 0
			? `## Route Measurements

${markdownTable(["Route", "Mode", "Open time", "Actual URL", "DOM nodes", "Error"], routeRows(report.routeMeasurements))}
`
			: `## Route Measurements

- No routes measured. Pass \`--route=/tasks\` or another hash route to collect route-open timings.
`;

	const consoleErrors =
		automation.consoleErrors.length === 0
			? "- None"
			: automation.consoleErrors
					.map(
						(entry) =>
							`- ${new Date(entry.timestamp).toISOString()} - \`${entry.message.slice(0, 240)}\``,
					)
					.join("\n");

	return `# Desktop Runtime Performance Report

Generated at: ${report.generatedAt}

## Capture

- Duration: ${formatMs(report.processSummary.durationMs)}
- Interval: ${formatMs(report.options.intervalMs)}
- Samples: ${report.processSummary.sampleCount}
- Automation: ${report.options.automation ? "enabled" : "disabled"}
- Window: ${windowInfo ? `${windowInfo.viewportWidth}x${windowInfo.viewportHeight}, focused=${windowInfo.focused}` : "unavailable"}
- URL: ${windowInfo?.url ? `\`${windowInfo.url}\`` : "unavailable"}
${automation.error ? `- Automation error: \`${automation.error.replaceAll("`", "'")}\`` : ""}

## Startup Timeline

${
	report.startup.error
		? `- Startup capture error: \`${report.startup.error.replaceAll("`", "'")}\``
		: `- Process started: ${report.startup.report?.processStartedAt ?? "n/a"}
- Uptime at capture: ${formatMs(report.startup.report?.uptimeMs)}`
}

${markdownTable(["Mark", "Elapsed", "Timestamp", "Detail"], startupMarkRows(report.startup))}

${markdownTable(["Adjacent phase", "Duration"], startupDurationRows(report.startup))}

## Renderer Snapshot

${markdownTable(["Metric", "Value"], rendererSummaryRows(automation.renderer))}

## Process Totals

${markdownTable(
	["Scope", "Max count", "Avg CPU", "Max CPU", "Avg memory", "Max memory"],
	groupSummaryRows([
		{ ...processSummary.desktop, role: "desktop-dev-runner" },
		{ ...processSummary.services, role: "other-service" },
		{ ...processSummary.all, role: "other" },
	]),
)}

## Process Groups

${markdownTable(
	["Group", "Max count", "Avg CPU", "Max CPU", "Avg memory", "Max memory"],
	groupSummaryRows(processSummary.groups),
)}

## Top Processes By Memory

${markdownTable(["PID", "Role", "Avg CPU", "Max CPU", "Max memory", "Command"], processRows(processSummary.topByMemory))}

## Top Processes By CPU

${markdownTable(["PID", "Role", "Avg CPU", "Max CPU", "Max memory", "Command"], processRows(processSummary.topByCpu))}

${routeSection}
## Renderer Console Errors

${consoleErrors}

## Notes

- Memory uses macOS \`phys_footprint\` when the native helper is available; otherwise it falls back to RSS.
- Route timing is measured inside the renderer with SPA hash navigation plus ${formatMs(report.options.routeSettleMs)} of settle time. It is a regression signal, not a full UX trace.
- The JSON report contains raw per-sample process data for before/after comparisons.
`;
}

async function main(): Promise<void> {
	const options = parseCliOptions(process.argv.slice(2));
	const timestamp = timestampForFile();
	const reportDir = resolveWorkspacePath(options.reportDir);
	const markdownPath =
		options.markdownOut ??
		resolve(reportDir, `runtime-performance-${timestamp}.md`);
	const jsonPath =
		options.jsonOut ??
		resolve(reportDir, `runtime-performance-${timestamp}.json`);

	const automation = options.automation ? new DesktopAutomation() : null;
	let report: RuntimeReport;
	try {
		const initialAutomation = await captureAutomationSnapshot(
			options,
			automation,
		);
		const originalRoute = getHashPath(initialAutomation.windowInfo?.url);
		const routeMeasurements = await measureRoutes(
			options,
			automation,
			originalRoute,
		);
		const finalAutomation =
			routeMeasurements.length > 0
				? await captureAutomationSnapshot(options, automation)
				: initialAutomation;
		const startup = await captureStartupPerformance(options, automation);
		const samples = await captureProcessSamples(options);
		report = {
			generatedAt: new Date().toISOString(),
			options,
			startup,
			automation: finalAutomation,
			routeMeasurements,
			processSummary: summarizeSamples(samples, options.topLimit),
			samples,
			outputs: {
				markdownPath,
				jsonPath,
			},
		};
	} finally {
		automation?.disconnect();
	}
	const markdown = renderMarkdown(report);

	mkdirSync(reportDir, { recursive: true });
	writeFileSync(markdownPath, markdown);
	writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

	console.log(markdown);
	console.log(`\nMarkdown report: ${markdownPath}`);
	console.log(`JSON report: ${jsonPath}`);

	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${markdown}\n`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
