import { describe, expect, test } from "bun:test";

/**
 * Standalone snapshot normalizer extracted from the module for unit testing.
 * Mirrors the `normalizeSnapshot` function in index.ts without Electron imports.
 *
 * The fix for issue #2074: pidusage and Electron's getAppMetrics() return CPU
 * as a per-core percentage (0–100% per core). On a multi-core machine, summing
 * these values produces totals well above 100%, which look "impossibly high" to
 * users. The fix divides every CPU value by cpuCoreCount so the display always
 * reflects system-relative load (0–100% of total CPU capacity).
 */

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

interface ResourceMetricsSnapshot {
	app: AppMetrics;
	workspaces: WorkspaceMetrics[];
	host: HostMetrics;
	totalCpu: number;
	totalMemory: number;
	collectedAt: number;
}

function normalizeFiniteNumber(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.max(0, value);
}

/**
 * This replicates the production normalizeSnapshot from index.ts (minus the
 * `createHostMetrics()` call that depends on `os` and isn't relevant here).
 * We inject a pre-built host so the test controls cpuCoreCount.
 *
 * Includes the fix: all CPU values are divided by host.cpuCoreCount so the
 * result is always a system-relative percentage (0–100%).
 */
function normalizeSnapshot(
	snapshot: ResourceMetricsSnapshot,
): ResourceMetricsSnapshot {
	const host = snapshot.host;
	const coreCount = host.cpuCoreCount;
	const normCpu = (raw: unknown) => normalizeFiniteNumber(raw) / coreCount;

	const appMain = {
		cpu: normCpu(snapshot.app.main.cpu),
		memory: normalizeFiniteNumber(snapshot.app.main.memory),
	};
	const appRenderer = {
		cpu: normCpu(snapshot.app.renderer.cpu),
		memory: normalizeFiniteNumber(snapshot.app.renderer.memory),
	};
	const appOther = {
		cpu: normCpu(snapshot.app.other.cpu),
		memory: normalizeFiniteNumber(snapshot.app.other.memory),
	};
	const workspaces = snapshot.workspaces.map((workspace) => {
		const sessions = workspace.sessions.map((session) => ({
			sessionId: session.sessionId,
			paneId: session.paneId,
			pid: Math.max(0, Math.floor(normalizeFiniteNumber(session.pid))),
			cpu: normCpu(session.cpu),
			memory: normalizeFiniteNumber(session.memory),
		}));

		return {
			workspaceId: workspace.workspaceId,
			projectId: workspace.projectId,
			projectName: workspace.projectName,
			workspaceName: workspace.workspaceName,
			cpu: normCpu(workspace.cpu),
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

function makeSnapshot(
	overrides: Partial<ResourceMetricsSnapshot> & {
		host: HostMetrics;
	},
): ResourceMetricsSnapshot {
	return {
		app: {
			cpu: 0,
			memory: 0,
			main: { cpu: 0, memory: 0 },
			renderer: { cpu: 0, memory: 0 },
			other: { cpu: 0, memory: 0 },
		},
		workspaces: [],
		totalCpu: 0,
		totalMemory: 0,
		collectedAt: Date.now(),
		...overrides,
	};
}

describe("normalizeSnapshot – CPU over 100% reproduction (issue #2074)", () => {
	test("on an 8-core machine, per-core CPU values sum above 100%", () => {
		// pidusage returns per-core percentages; each process reports up to 100% per
		// core. On an 8-core machine with multiple busy processes the raw sum easily
		// exceeds 100 – here simulating app (120%) + two workspace sessions (80% each).
		const cpuCoreCount = 8;
		const snapshot = makeSnapshot({
			host: {
				totalMemory: 16 * 1024 * 1024 * 1024,
				freeMemory: 8 * 1024 * 1024 * 1024,
				usedMemory: 8 * 1024 * 1024 * 1024,
				memoryUsagePercent: 50,
				cpuCoreCount,
				loadAverage1m: 4,
			},
			app: {
				cpu: 120,
				memory: 100 * 1024 * 1024,
				main: { cpu: 60, memory: 50 * 1024 * 1024 },
				renderer: { cpu: 60, memory: 50 * 1024 * 1024 },
				other: { cpu: 0, memory: 0 },
			},
			workspaces: [
				{
					workspaceId: "ws-1",
					projectId: "proj-1",
					projectName: "Project",
					workspaceName: "Workspace",
					cpu: 160,
					memory: 200 * 1024 * 1024,
					sessions: [
						{
							sessionId: "s1",
							paneId: "p1",
							pid: 1000,
							cpu: 80,
							memory: 100 * 1024 * 1024,
						},
						{
							sessionId: "s2",
							paneId: "p2",
							pid: 1001,
							cpu: 80,
							memory: 100 * 1024 * 1024,
						},
					],
				},
			],
			totalCpu: 280,
			totalMemory: 300 * 1024 * 1024,
		});

		const result = normalizeSnapshot(snapshot);

		// Fix: totalCpu is divided by cpuCoreCount (280 / 8 = 35), so it stays <= 100%.
		expect(result.totalCpu).toBeLessThanOrEqual(100);
		expect(result.totalCpu).toBeCloseTo(35, 5);
	});

	test("on a 4-core machine, totalCpu of 320% normalizes to 80%", () => {
		const cpuCoreCount = 4;
		const snapshot = makeSnapshot({
			host: {
				totalMemory: 8 * 1024 * 1024 * 1024,
				freeMemory: 4 * 1024 * 1024 * 1024,
				usedMemory: 4 * 1024 * 1024 * 1024,
				memoryUsagePercent: 50,
				cpuCoreCount,
				loadAverage1m: 2,
			},
			app: {
				cpu: 200,
				memory: 100 * 1024 * 1024,
				main: { cpu: 100, memory: 50 * 1024 * 1024 },
				renderer: { cpu: 100, memory: 50 * 1024 * 1024 },
				other: { cpu: 0, memory: 0 },
			},
			workspaces: [
				{
					workspaceId: "ws-1",
					projectId: "proj-1",
					projectName: "Project",
					workspaceName: "Workspace",
					cpu: 120,
					memory: 50 * 1024 * 1024,
					sessions: [
						{
							sessionId: "s1",
							paneId: "p1",
							pid: 2000,
							cpu: 120,
							memory: 50 * 1024 * 1024,
						},
					],
				},
			],
			totalCpu: 320,
			totalMemory: 150 * 1024 * 1024,
		});

		const result = normalizeSnapshot(snapshot);

		// Fix: 320 per-core % / 4 cores = 80% system-relative.
		expect(result.totalCpu).toBeCloseTo(80, 5);
		// Individual workspace and session values are also normalized.
		expect(result.workspaces[0].cpu).toBeCloseTo(30, 5); // 120 / 4
		expect(result.workspaces[0].sessions[0].cpu).toBeCloseTo(30, 5); // 120 / 4
	});
});
