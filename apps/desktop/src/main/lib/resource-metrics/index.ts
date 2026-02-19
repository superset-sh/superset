import { workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
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
	workspaceName: string;
	cpu: number;
	memory: number;
	sessions: SessionMetrics[];
}

export interface ResourceMetricsSnapshot {
	app: ProcessMetrics;
	workspaces: WorkspaceMetrics[];
	totalCpu: number;
	totalMemory: number;
}

export async function collectResourceMetrics(): Promise<ResourceMetricsSnapshot> {
	const registry = getWorkspaceRuntimeRegistry();
	const { sessions } = await registry
		.getDefault()
		.terminal.management.listSessions();

	// Collect alive session PIDs grouped by workspace
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

	// Batch query all PIDs at once
	const allPids = [...workspaceSessionMap.values()].flat().map((s) => s.pid);

	let pidStats: Record<number, pidusage.Status> = {};
	if (allPids.length > 0) {
		try {
			pidStats = await pidusage(allPids);
		} catch {
			// Some PIDs may have exited between listing and querying
		}
	}

	// Get app (Electron main process) metrics
	const cpuUsage = process.cpuUsage();
	const memUsage = process.memoryUsage();
	const appMetrics: ProcessMetrics = {
		// Convert microseconds to a rough percentage (scaled to 1 core)
		cpu: (cpuUsage.user + cpuUsage.system) / 1_000_000,
		memory: memUsage.rss,
	};

	// Build per-workspace metrics
	const workspaceMetricsList: WorkspaceMetrics[] = [];
	const nameCache = new Map<string, string>();

	for (const [workspaceId, entries] of workspaceSessionMap) {
		// Look up workspace name
		if (!nameCache.has(workspaceId)) {
			const ws = localDb
				.select({ name: workspaces.name })
				.from(workspaces)
				.where(eq(workspaces.id, workspaceId))
				.get();
			nameCache.set(workspaceId, ws?.name ?? "Unknown");
		}

		const sessionMetrics: SessionMetrics[] = [];
		let wsCpu = 0;
		let wsMemory = 0;

		for (const entry of entries) {
			const stats = pidStats[entry.pid];
			const cpu = stats?.cpu ?? 0;
			const memory = stats?.memory ?? 0;

			sessionMetrics.push({
				sessionId: entry.sessionId,
				paneId: entry.paneId,
				pid: entry.pid,
				cpu,
				memory,
			});

			wsCpu += cpu;
			wsMemory += memory;
		}

		workspaceMetricsList.push({
			workspaceId,
			workspaceName: nameCache.get(workspaceId) ?? "Unknown",
			cpu: wsCpu,
			memory: wsMemory,
			sessions: sessionMetrics,
		});
	}

	// Compute totals (app + all sessions)
	const sessionCpuTotal = workspaceMetricsList.reduce(
		(sum, ws) => sum + ws.cpu,
		0,
	);
	const sessionMemoryTotal = workspaceMetricsList.reduce(
		(sum, ws) => sum + ws.memory,
		0,
	);

	return {
		app: appMetrics,
		workspaces: workspaceMetricsList,
		totalCpu: appMetrics.cpu + sessionCpuTotal,
		totalMemory: appMetrics.memory + sessionMemoryTotal,
	};
}
