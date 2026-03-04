import { describe, expect, test } from "bun:test";
import {
	createFallbackResourceMetricsSnapshot,
	resourceMetricsSnapshotSchema,
	validateResourceMetricsSnapshot,
} from "./resource-metrics.schema";

describe("resourceMetricsSnapshotSchema", () => {
	test("fallback snapshot matches schema", () => {
		const fallback = createFallbackResourceMetricsSnapshot();
		const parsed = resourceMetricsSnapshotSchema.safeParse(fallback);

		expect(parsed.success).toBe(true);
	});

	test("returns fallback when host is missing", () => {
		const invalidSnapshot = {
			app: {
				cpu: 12,
				memory: 1024,
				main: { cpu: 4, memory: 512 },
				renderer: { cpu: 8, memory: 512 },
				other: { cpu: 0, memory: 0 },
			},
			workspaces: [],
			totalCpu: 12,
			totalMemory: 1024,
			collectedAt: Date.now(),
		};

		const validated = validateResourceMetricsSnapshot(invalidSnapshot);

		expect(validated.isValid).toBe(false);
		expect(validated.snapshot.host).toBeDefined();
		expect(validated.snapshot.host.totalMemory).toBeGreaterThanOrEqual(0);
		expect(validated.snapshot.totalMemory).toBe(0);
	});

	test("keeps valid snapshots unchanged", () => {
		const validSnapshot = createFallbackResourceMetricsSnapshot();
		const validated = validateResourceMetricsSnapshot(validSnapshot);

		expect(validated.isValid).toBe(true);
		expect(validated.snapshot).toEqual(validSnapshot);
		expect(validated.issues).toHaveLength(0);
	});

	test("ignores additive fields while preserving required metrics", () => {
		const validSnapshot = createFallbackResourceMetricsSnapshot();
		const snapshotWithExtras = {
			...validSnapshot,
			unexpectedTopLevelKey: "extra",
			host: {
				...validSnapshot.host,
				unexpectedHostKey: "extra",
			},
		};

		const validated = validateResourceMetricsSnapshot(snapshotWithExtras);

		expect(validated.isValid).toBe(true);
		expect(validated.snapshot.totalMemory).toBe(validSnapshot.totalMemory);
		expect(validated.snapshot.host.totalMemory).toBe(
			validSnapshot.host.totalMemory,
		);
	});
});
