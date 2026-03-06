import os from "node:os";
import { projects, workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { app } from "electron";
import { localDb } from "main/lib/local-db";
import { getProcessTree } from "main/lib/terminal/port-scanner";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime/registry";
import pidusage from "pidusage";

interface ProcessMetrics {
	cpu: number;
	memory: number;
}

interface SessionMetrics {
	sessionId: string;
	paneId: string;
	pid: number;
	cpu: number;
	memory: number;
}

interface WorkspaceMetrics {
	workspaceId: string;
	projectId: string;
	projectName: string;
	workspaceName: string;
	cpu: number;
	memory: number;
	sessions: SessionMetrics[];
}

interface AppMetrics extends ProcessMetrics {
	main: ProcessMetrics;
	renderer: ProcessMetrics;
	other: ProcessMetrics;
}

interface HostMetrics {
	totalMemory: number;
	freeMemory: number;
	usedMemory: number;
	memoryUsagePercent: number;
	cpuCoreCount: number;
	loadAverage1m: number;
}

export interface ResourceMetricsSnapshot {
	app: AppMetrics;
	workspaces: WorkspaceMetrics[];
	host: HostMetrics;
	totalCpu: number;
	totalMemory: number;
	collectedAt: number;
}

type SnapshotMode = "interactive" | "idle";

interface CollectResourceMetricsOptions {
	mode?: SnapshotMode;
	force?: boolean;
}

const SNAPSHOT_MAX_AGE_MS: Record<SnapshotMode, number> = {
	interactive: 2500,
	idle: 15000,
};

let cachedSnapshot: ResourceMetricsSnapshot | null = null;
let inflightCollection: Promise<ResourceMetricsSnapshot> | null = null;

function normalizeFiniteNumber(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.max(0, value);
}

function createHostMetrics(): HostMetrics {
	const totalHostMemory = normalizeFiniteNumber(os.totalmem());
	const freeHostMemory = normalizeFiniteNumber(os.freemem());
	const usedHostMemory = Math.max(0, totalHostMemory - freeHostMemory);
	const cpuCoreCount = Math.max(1, os.cpus().length);
	const loadAverage1m = normalizeFiniteNumber(os.loadavg()[0]);

	return {
		totalMemory: totalHostMemory,
		freeMemory: freeHostMemory,
		usedMemory: usedHostMemory,
		memoryUsagePercent:
			totalHostMemory > 0 ? (usedHostMemory / totalHostMemory) * 100 : 0,
		cpuCoreCount,
		loadAverage1m,
	};
}

function createEmptySnapshot(): ResourceMetricsSnapshot {
	return {
		app: {
			cpu: 0,
			memory: 0,
			main: { cpu: 0, memory: 0 },
			renderer: { cpu: 0, memory: 0 },
			other: { cpu: 0, memory: 0 },
		},
		workspaces: [],
		host: createHostMetrics(),
		totalCpu: 0,
		totalMemory: 0,
		collectedAt: Date.now(),
	};
}

function normalizeSnapshot(
	snapshot: ResourceMetricsSnapshot,
): ResourceMetricsSnapshot {
	const appMain = {
		cpu: normalizeFiniteNumber(snapshot.app.main.cpu),
		memory: normalizeFiniteNumber(snapshot.app.main.memory),
	};
	const appRenderer = {
		cpu: normalizeFiniteNumber(snapshot.app.renderer.cpu),
		memory: normalizeFiniteNumber(snapshot.app.renderer.memory),
	};
	const appOther = {
		cpu: normalizeFiniteNumber(snapshot.app.other.cpu),
		memory: normalizeFiniteNumber(snapshot.app.other.memory),
	};
	const workspaces = snapshot.workspaces.map((workspace) => {
		const sessions = workspace.sessions.map((session) => ({
			sessionId: session.sessionId,
			paneId: session.paneId,
			pid: Math.max(0, Math.floor(normalizeFiniteNumber(session.pid))),
			cpu: normalizeFiniteNumber(session.cpu),
			memory: normalizeFiniteNumber(session.memory),
		}));

		return {
			workspaceId: workspace.workspaceId,
			projectId: workspace.projectId,
			projectName: workspace.projectName,
			workspaceName: workspace.workspaceName,
			cpu: normalizeFiniteNumber(workspace.cpu),
			memory: normalizeFiniteNumber(workspace.memory),
			sessions,
		};
	});
	const sessionCpuTotal = workspaces.reduce(
		(sum, workspace) => sum + workspace.cpu,
		0,
	);
	const sessionMemoryTotal = workspaces.reduce(
		(sum, workspace) => sum + workspace.memory,
		0,
	);
	const host = createHostMetrics();
	const app = {
		main: appMain,
		renderer: appRenderer,
		other: appOther,
		cpu: appMain.cpu + appRenderer.cpu + appOther.cpu,
		memory: appMain.memory + appRenderer.memory + appOther.memory,
	};

	return {
		app,
		workspaces,
		host,
		totalCpu: app.cpu + sessionCpuTotal,
		totalMemory: app.memory + sessionMemoryTotal,
		collectedAt:
			typeof snapshot.collectedAt === "number" &&
			Number.isFinite(snapshot.collectedAt)
				? snapshot.collectedAt
				: Date.now(),
	};
}

function getSnapshotMaxAge(mode: SnapshotMode): number {
	return SNAPSHOT_MAX_AGE_MS[mode];
}

export async function collectResourceMetrics(
	options: CollectResourceMetricsOptions = {},
): Promise<ResourceMetricsSnapshot> {
	const mode = options.mode ?? "interactive";
	const maxAgeMs = getSnapshotMaxAge(mode);

	if (!options.force && cachedSnapshot) {
		const ageMs = Date.now() - cachedSnapshot.collectedAt;
		if (ageMs <= maxAgeMs) {
			return cachedSnapshot;
		}
	}

	// Avoid duplicate expensive process-tree scans for concurrent callers.
	if (inflightCollection) {
		return inflightCollection;
	}

	inflightCollection = collectResourceMetricsNow()
		.catch((error) => {
			console.warn(
				"[resource-metrics] Failed to collect resource metrics; returning a safe fallback snapshot",
				error,
			);
			return cachedSnapshot ?? createEmptySnapshot();
		})
		.then((snapshot) => {
			const normalized = normalizeSnapshot(snapshot);
			cachedSnapshot = normalized;
			return normalized;
		})
		.finally(() => {
			inflightCollection = null;
		});

	return inflightCollection;
}

async function collectResourceMetricsNow(): Promise<ResourceMetricsSnapshot> {
	const registry = getWorkspaceRuntimeRegistry();
	const { sessions } = await registry
		.getDefault()
		.terminal.management.listSessions();

	const workspaceSessionMap = new Map<
		string,
		Array<{ sessionId: string; paneId: string; pid: number }>
	>();

	for (const session of sessions) {
		if (!session.isAlive || session.pid == null) continue;

		let entries = workspaceSessionMap.get(session.workspaceId);
		if (!entries) {
			entries = [];
			workspaceSessionMap.set(session.workspaceId, entries);
		}
		entries.push({
			sessionId: session.sessionId,
			paneId: session.paneId,
			pid: session.pid,
		});
	}

	const allEntries = [...workspaceSessionMap.values()].flat();
	const sessionPidTrees = await Promise.all(
		allEntries.map(async (entry) => ({
			entry,
			treePids: await getProcessTree(entry.pid).catch(() => [entry.pid]),
		})),
	);

	const allPids = [...new Set(sessionPidTrees.flatMap((s) => s.treePids))];
	let pidStats: Record<number, pidusage.Status> = {};
	if (allPids.length > 0) {
		try {
			pidStats = await pidusage(allPids);
		} catch {
			// PIDs may have exited between listing and querying.
		}
	}

	const electronMetrics = app.getAppMetrics();
	const main: ProcessMetrics = { cpu: 0, memory: 0 };
	const renderer: ProcessMetrics = { cpu: 0, memory: 0 };
	const other: ProcessMetrics = { cpu: 0, memory: 0 };

	const isRendererProcessType = (type: string): boolean => {
		const normalized = type.toLowerCase();
		return normalized === "renderer" || normalized === "tab";
	};

	for (const proc of electronMetrics) {
		const cpu = normalizeFiniteNumber(proc.cpu?.percentCPUUsage);
		// Electron returns workingSetSize in KB.
		const memory = normalizeFiniteNumber(proc.memory?.workingSetSize) * 1024;
		let target = other;
		if (proc.type === "Browser") {
			target = main;
		} else if (
			typeof proc.type === "string" &&
			isRendererProcessType(proc.type)
		) {
			target = renderer;
		}
		target.cpu += cpu;
		target.memory += memory;
	}
	const appMetrics: AppMetrics = {
		cpu: main.cpu + renderer.cpu + other.cpu,
		memory: main.memory + renderer.memory + other.memory,
		main,
		renderer,
		other,
	};

	const sessionAggregated = new Map<string, { cpu: number; memory: number }>();
	for (const { entry, treePids } of sessionPidTrees) {
		let cpu = 0;
		let memory = 0;
		for (const pid of treePids) {
			const stats = pidStats[pid];
			if (stats) {
				cpu += normalizeFiniteNumber(stats.cpu);
				memory += normalizeFiniteNumber(stats.memory);
			}
		}
		sessionAggregated.set(entry.sessionId, { cpu, memory });
	}

	const workspaceMetricsList: WorkspaceMetrics[] = [];
	const workspaceMetaCache = new Map<
		string,
		{ workspaceName: string; projectId: string; projectName: string }
	>();

	for (const [workspaceId, entries] of workspaceSessionMap) {
		if (!workspaceMetaCache.has(workspaceId)) {
			const ws = localDb
				.select({
					workspaceName: workspaces.name,
					projectId: workspaces.projectId,
					projectName: projects.name,
				})
				.from(workspaces)
				.leftJoin(projects, eq(projects.id, workspaces.projectId))
				.where(eq(workspaces.id, workspaceId))
				.get();
			workspaceMetaCache.set(workspaceId, {
				workspaceName: ws?.workspaceName ?? "Unknown",
				projectId: ws?.projectId ?? "unknown",
				projectName: ws?.projectName ?? "Unknown Project",
			});
		}

		const sessionMetrics: SessionMetrics[] = [];
		let wsCpu = 0;
		let wsMemory = 0;

		for (const entry of entries) {
			const agg = sessionAggregated.get(entry.sessionId) ?? {
				cpu: 0,
				memory: 0,
			};

			sessionMetrics.push({
				sessionId: entry.sessionId,
				paneId: entry.paneId,
				pid: entry.pid,
				cpu: agg.cpu,
				memory: agg.memory,
			});

			wsCpu += agg.cpu;
			wsMemory += agg.memory;
		}

		workspaceMetricsList.push({
			workspaceId,
			projectId: workspaceMetaCache.get(workspaceId)?.projectId ?? "unknown",
			projectName:
				workspaceMetaCache.get(workspaceId)?.projectName ?? "Unknown Project",
			workspaceName:
				workspaceMetaCache.get(workspaceId)?.workspaceName ?? "Unknown",
			cpu: wsCpu,
			memory: wsMemory,
			sessions: sessionMetrics,
		});
	}

	const sessionCpuTotal = workspaceMetricsList.reduce(
		(sum, ws) => sum + ws.cpu,
		0,
	);
	const sessionMemoryTotal = workspaceMetricsList.reduce(
		(sum, ws) => sum + ws.memory,
		0,
	);

	return normalizeSnapshot({
		app: appMetrics,
		workspaces: workspaceMetricsList,
		host: createHostMetrics(),
		totalCpu: appMetrics.cpu + sessionCpuTotal,
		totalMemory: appMetrics.memory + sessionMemoryTotal,
		collectedAt: Date.now(),
	});
}
