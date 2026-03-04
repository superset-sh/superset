import os from "node:os";
import type { z } from "zod";
import { z as zod } from "zod";

const nonNegativeFiniteNumberSchema = zod.number().finite().min(0);

const usageValuesSchema = zod.object({
	cpu: nonNegativeFiniteNumberSchema,
	memory: nonNegativeFiniteNumberSchema,
});

const sessionMetricsSchema = usageValuesSchema.extend({
	sessionId: zod.string().min(1),
	paneId: zod.string().min(1),
	pid: zod.number().int().min(0),
});

const workspaceMetricsSchema = usageValuesSchema.extend({
	workspaceId: zod.string().min(1),
	projectId: zod.string().min(1),
	projectName: zod.string().min(1),
	workspaceName: zod.string().min(1),
	sessions: zod.array(sessionMetricsSchema),
});

const appMetricsSchema = usageValuesSchema.extend({
	main: usageValuesSchema,
	renderer: usageValuesSchema,
	other: usageValuesSchema,
});

const hostMetricsSchema = zod.object({
	totalMemory: nonNegativeFiniteNumberSchema,
	freeMemory: nonNegativeFiniteNumberSchema,
	usedMemory: nonNegativeFiniteNumberSchema,
	memoryUsagePercent: nonNegativeFiniteNumberSchema,
	cpuCoreCount: zod.number().int().min(1),
	loadAverage1m: nonNegativeFiniteNumberSchema,
});

export const resourceMetricsSnapshotSchema = zod.object({
	app: appMetricsSchema,
	workspaces: zod.array(workspaceMetricsSchema),
	host: hostMetricsSchema,
	totalCpu: nonNegativeFiniteNumberSchema,
	totalMemory: nonNegativeFiniteNumberSchema,
	collectedAt: zod.number().int().min(0),
});

export type ResourceMetricsSnapshot = z.infer<
	typeof resourceMetricsSnapshotSchema
>;

function safeSystemNumber(getValue: () => number): number {
	try {
		const value = getValue();
		if (!Number.isFinite(value)) return 0;
		return Math.max(0, value);
	} catch {
		return 0;
	}
}

function safeCpuCoreCount(): number {
	try {
		const cores = os.cpus().length;
		if (!Number.isFinite(cores) || cores <= 0) return 1;
		return Math.floor(cores);
	} catch {
		return 1;
	}
}

export function createFallbackResourceMetricsSnapshot(): ResourceMetricsSnapshot {
	const totalMemory = safeSystemNumber(() => os.totalmem());
	const freeMemory = safeSystemNumber(() => os.freemem());
	const usedMemory = Math.max(0, totalMemory - freeMemory);

	return {
		app: {
			cpu: 0,
			memory: 0,
			main: { cpu: 0, memory: 0 },
			renderer: { cpu: 0, memory: 0 },
			other: { cpu: 0, memory: 0 },
		},
		workspaces: [],
		host: {
			totalMemory,
			freeMemory,
			usedMemory,
			memoryUsagePercent:
				totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0,
			cpuCoreCount: safeCpuCoreCount(),
			loadAverage1m: safeSystemNumber(() => os.loadavg()[0] ?? 0),
		},
		totalCpu: 0,
		totalMemory: 0,
		collectedAt: Date.now(),
	};
}

interface ResourceMetricsValidationResult {
	isValid: boolean;
	snapshot: ResourceMetricsSnapshot;
	issues: z.ZodIssue[];
}

export function validateResourceMetricsSnapshot(
	snapshot: unknown,
): ResourceMetricsValidationResult {
	const parsed = resourceMetricsSnapshotSchema.safeParse(snapshot);
	if (parsed.success) {
		return { isValid: true, snapshot: parsed.data, issues: [] };
	}

	return {
		isValid: false,
		snapshot: createFallbackResourceMetricsSnapshot(),
		issues: parsed.error.issues,
	};
}
