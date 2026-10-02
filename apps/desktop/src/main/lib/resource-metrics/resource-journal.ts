import { exec } from "node:child_process";
import { appendFile, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { listPtyDaemonManifests } from "@superset/host-service/daemon-manifest";
import { rotateLogIfOversized } from "@superset/shared/rotating-log";
import { app, webContents } from "electron";
import { SUPERSET_HOME_DIR } from "../app-environment";
import { readManifest } from "../host-service-manifest";
import {
	captureProcessSnapshot,
	enrichWithPhysFootprint,
	getSubtreePids,
	type ProcessSnapshot,
} from "./process-tree";

const JOURNAL_PATH = path.join(SUPERSET_HOME_DIR, "resources.jsonl");
const MAX_JOURNAL_BYTES = 20 * 1024 * 1024;
const SAMPLE_INTERVAL_MS = 60_000;
const OTHER_PROCESS_COUNT = 10;
// phys_footprint can reorder processes whose RSS is close, so measure a
// wider set than the one recorded.
const FOOTPRINT_CANDIDATE_COUNT = 40;
const BYTES_PER_MB = 1024 * 1024;

const execAsync = promisify(exec);

interface MemoryPressure {
	level?: "normal" | "warn" | "critical";
	availableMb?: number;
	swapUsedMb?: number;
	swapTotalMb?: number;
}

function toMb(bytes: number): number {
	return Math.round(bytes / BYTES_PER_MB);
}

const MACOS_PRESSURE_LEVELS: Record<string, MemoryPressure["level"]> = {
	"1": "normal",
	"2": "warn",
	"4": "critical",
};

async function readMacosPressure(): Promise<MemoryPressure> {
	const { stdout } = await execAsync(
		"sysctl -n kern.memorystatus_vm_pressure_level vm.swapusage",
		{ timeout: 5_000 },
	);
	const [levelLine = "", swapLine = ""] = stdout.trim().split("\n");
	const swapTotal = swapLine.match(/total = ([\d.]+)M/)?.[1];
	const swapUsed = swapLine.match(/used = ([\d.]+)M/)?.[1];
	return {
		level: MACOS_PRESSURE_LEVELS[levelLine.trim()],
		swapTotalMb: swapTotal ? Math.round(Number(swapTotal)) : undefined,
		swapUsedMb: swapUsed ? Math.round(Number(swapUsed)) : undefined,
	};
}

async function readLinuxPressure(): Promise<MemoryPressure> {
	const meminfo = await readFile("/proc/meminfo", "utf-8");
	const kb = (field: string): number | undefined => {
		const value = meminfo.match(
			new RegExp(`^${field}:\\s+(\\d+) kB`, "m"),
		)?.[1];
		return value ? Number(value) : undefined;
	};
	const available = kb("MemAvailable");
	const swapTotal = kb("SwapTotal");
	const swapFree = kb("SwapFree");
	return {
		availableMb:
			available === undefined ? undefined : Math.round(available / 1024),
		swapTotalMb:
			swapTotal === undefined ? undefined : Math.round(swapTotal / 1024),
		swapUsedMb:
			swapTotal === undefined || swapFree === undefined
				? undefined
				: Math.round((swapTotal - swapFree) / 1024),
	};
}

async function readMemoryPressure(): Promise<MemoryPressure> {
	try {
		if (process.platform === "darwin") return await readMacosPressure();
		if (process.platform === "linux") return await readLinuxPressure();
		return {};
	} catch {
		return {};
	}
}

interface ProcessEntry {
	pid: number;
	name?: string;
	memoryMb: number;
	cpu: number;
}

function describe(snapshot: ProcessSnapshot, pid: number): ProcessEntry {
	const info = snapshot.byPid.get(pid);
	return {
		pid,
		name: info?.name,
		memoryMb: toMb(info?.memory ?? 0),
		cpu: Math.round(info?.cpu ?? 0),
	};
}

function heaviest(
	snapshot: ProcessSnapshot,
	pids: number[],
	count: number,
): ProcessEntry[] {
	return pids
		.map((pid) => describe(snapshot, pid))
		.sort((a, b) => b.memoryMb - a.memoryMb)
		.slice(0, count);
}

function sumMb(snapshot: ProcessSnapshot, pids: number[]): number {
	return toMb(
		pids.reduce(
			(total, pid) => total + (snapshot.byPid.get(pid)?.memory ?? 0),
			0,
		),
	);
}

const RENDERER_KIND_BY_WEB_CONTENTS_TYPE: Record<string, string> = {
	window: "window",
	webview: "browser-pane",
	browserView: "browser-pane",
};

function webContentsKindByPid(): Map<number, string> {
	const kinds = new Map<number, string>();
	for (const contents of webContents.getAllWebContents()) {
		const pid = contents.getOSProcessId();
		const type = contents.getType();
		if (kinds.get(pid) === "window") continue;
		kinds.set(pid, RENDERER_KIND_BY_WEB_CONTENTS_TYPE[type] ?? type);
	}
	return kinds;
}

async function readRoots() {
	const organizationIds = await readdir(
		path.join(SUPERSET_HOME_DIR, "host"),
	).catch(() => []);
	const hostServicePids = organizationIds.flatMap((organizationId) => {
		const pid = readManifest(organizationId)?.pid;
		return pid ? [{ organizationId, pid }] : [];
	});
	const ptyDaemonPids = listPtyDaemonManifests().map((manifest) => ({
		organizationId: manifest.organizationId,
		pid: manifest.pid,
	}));
	return { hostServicePids, ptyDaemonPids };
}

function readDesktop(snapshot: ProcessSnapshot) {
	const heap = process.memoryUsage();
	const kinds = webContentsKindByPid();
	const renderers: (ProcessEntry & { kind: string })[] = [];
	const helpers: (ProcessEntry & { kind: string })[] = [];
	for (const metric of app.getAppMetrics()) {
		if (metric.type === "Browser") continue;
		const entry = describe(snapshot, metric.pid);
		if (metric.type === "Tab") {
			renderers.push({ ...entry, kind: kinds.get(metric.pid) ?? "unknown" });
		} else {
			helpers.push({
				...entry,
				kind: metric.serviceName || metric.type.toLowerCase(),
			});
		}
	}
	return {
		version: app.getVersion(),
		main: {
			...describe(snapshot, process.pid),
			heapMb: {
				used: toMb(heap.heapUsed),
				total: toMb(heap.heapTotal),
				external: toMb(heap.external),
				arrayBuffers: toMb(heap.arrayBuffers),
			},
		},
		renderers,
		helpers,
	};
}

function readHostServices(
	snapshot: ProcessSnapshot,
	roots: { organizationId: string; pid: number }[],
) {
	return roots
		.filter((root) => snapshot.byPid.has(root.pid))
		.map(({ organizationId, pid }) => {
			const children = getSubtreePids(snapshot, pid).filter(
				(child) => child !== pid,
			);
			return {
				organizationId,
				...describe(snapshot, pid),
				children: {
					count: children.length,
					memoryMb: sumMb(snapshot, children),
					heaviest: heaviest(snapshot, children, 3),
				},
			};
		});
}

function readPtyDaemons(
	snapshot: ProcessSnapshot,
	roots: { organizationId: string; pid: number }[],
) {
	return roots
		.filter((root) => snapshot.byPid.has(root.pid))
		.map(({ organizationId, pid }) => {
			const descendants = getSubtreePids(snapshot, pid).filter(
				(child) => child !== pid,
			);
			return {
				organizationId,
				...describe(snapshot, pid),
				terminals: {
					count: snapshot.childrenOf.get(pid)?.length ?? 0,
					processCount: descendants.length,
					memoryMb: sumMb(snapshot, descendants),
					heaviest: heaviest(snapshot, descendants, 5),
				},
			};
		});
}

async function sample(): Promise<string> {
	const snapshot = await captureProcessSnapshot();
	const roots = await readRoots();
	const supersetPids = new Set([
		...getSubtreePids(snapshot, process.pid),
		...roots.hostServicePids.flatMap(({ pid }) =>
			getSubtreePids(snapshot, pid),
		),
		...roots.ptyDaemonPids.flatMap(({ pid }) => getSubtreePids(snapshot, pid)),
	]);
	const otherCandidates = [...snapshot.byPid.values()]
		.filter((info) => !supersetPids.has(info.pid))
		.sort((a, b) => b.memory - a.memory)
		.slice(0, FOOTPRINT_CANDIDATE_COUNT)
		.map((info) => info.pid);
	enrichWithPhysFootprint(snapshot, [...supersetPids, ...otherCandidates]);

	return JSON.stringify({
		at: new Date().toISOString(),
		system: {
			totalMb: toMb(os.totalmem()),
			freeMb: toMb(os.freemem()),
			load1: Math.round(os.loadavg()[0] * 100) / 100,
			pressure: await readMemoryPressure(),
		},
		desktop: readDesktop(snapshot),
		hostServices: readHostServices(snapshot, roots.hostServicePids),
		ptyDaemons: readPtyDaemons(snapshot, roots.ptyDaemonPids),
		otherProcesses: heaviest(snapshot, otherCandidates, OTHER_PROCESS_COUNT),
	});
}

/**
 * Appends one JSON line a minute to ~/.superset/resources.jsonl: machine
 * memory, then every Superset process by role (desktop main, renderers,
 * helpers, each host-service, each pty-daemon and its terminals), then the
 * heaviest other processes, so a slow or leaking host can be diagnosed from
 * the file after the fact.
 */
export function startResourceJournal(): void {
	let sampling = false;
	const timer = setInterval(async () => {
		if (sampling) return;
		sampling = true;
		try {
			const line = await sample();
			rotateLogIfOversized(JOURNAL_PATH, MAX_JOURNAL_BYTES);
			await appendFile(JOURNAL_PATH, `${line}\n`, { mode: 0o600 });
		} catch (error) {
			console.warn("[resource-journal] sample failed:", error);
		} finally {
			sampling = false;
		}
	}, SAMPLE_INTERVAL_MS);
	timer.unref();
}
