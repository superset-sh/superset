import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import {
	buildResourceSnapshot,
	emitResourceSnapshot,
	isMemoryTelemetryEnabled,
	type MemoryTelemetryDeps,
	RESOURCE_SNAPSHOT_EVENT,
	RESOURCE_SNAPSHOT_KEYS,
	SAMPLE_INTERVAL_MS,
	startMemoryTelemetry,
	stopMemoryTelemetry,
} from "./memory-telemetry";

type TrackCall = { event: string; properties: Record<string, number> };

function createDeps(overrides: Partial<MemoryTelemetryDeps> = {}): {
	deps: MemoryTelemetryDeps;
	calls: TrackCall[];
} {
	const calls: TrackCall[] = [];
	const deps: MemoryTelemetryDeps = {
		getAppMetrics: () =>
			[
				{ type: "Browser", memory: { workingSetSize: 100 } },
				{ type: "Tab", memory: { workingSetSize: 200 } },
				{ type: "Renderer", memory: { workingSetSize: 300 } },
				{ type: "GPU", memory: { workingSetSize: 50 } },
				// biome-ignore lint/suspicious/noExplicitAny: minimal ProcessMetric stub
			] as any,
		getMemoryUsage: () =>
			({
				rss: 1_000,
				heapTotal: 800,
				heapUsed: 500,
				external: 40,
				arrayBuffers: 20,
				// biome-ignore lint/suspicious/noExplicitAny: minimal MemoryUsage stub
			}) as any,
		getUptimeSeconds: () => 123.7,
		getWindowCount: () => 2,
		getWebContentsCount: () => 5,
		track: (event, properties) => calls.push({ event, properties }),
		isEnabled: () => true,
		random: () => 0,
		...overrides,
	};
	return { deps, calls };
}

afterEach(() => {
	stopMemoryTelemetry();
	jest.useRealTimers();
});

describe("buildResourceSnapshot", () => {
	it("aggregates Electron process classes and process memory", () => {
		const { deps } = createDeps();
		const snapshot = buildResourceSnapshot(deps);

		// Browser -> main, Tab + Renderer -> renderer, GPU -> other. KB -> bytes.
		expect(snapshot.electron_main_rss_bytes).toBe(100 * 1024);
		expect(snapshot.electron_renderer_rss_bytes).toBe((200 + 300) * 1024);
		expect(snapshot.electron_other_rss_bytes).toBe(50 * 1024);
		expect(snapshot.electron_total_rss_bytes).toBe(
			(100 + 200 + 300 + 50) * 1024,
		);

		expect(snapshot.electron_main_process_count).toBe(1);
		expect(snapshot.electron_renderer_process_count).toBe(2);
		expect(snapshot.electron_other_process_count).toBe(1);
		expect(snapshot.electron_process_count).toBe(4);

		expect(snapshot.process_rss_bytes).toBe(1_000);
		expect(snapshot.process_heap_used_bytes).toBe(500);
		expect(snapshot.process_array_buffers_bytes).toBe(20);

		expect(snapshot.uptime_seconds).toBe(124); // rounded
		expect(snapshot.window_count).toBe(2);
		expect(snapshot.web_contents_count).toBe(5);
	});
});

describe("emitResourceSnapshot payload allowlist", () => {
	it("emits only allowlisted keys and every value is a finite number", () => {
		const { deps, calls } = createDeps();
		emitResourceSnapshot(deps);

		expect(calls).toHaveLength(1);
		expect(calls[0].event).toBe(RESOURCE_SNAPSHOT_EVENT);

		const keys = Object.keys(calls[0].properties);
		const allowlist = new Set<string>(RESOURCE_SNAPSHOT_KEYS);
		for (const key of keys) {
			expect(allowlist.has(key)).toBe(true);
		}
		for (const value of Object.values(calls[0].properties)) {
			expect(typeof value).toBe("number");
			expect(Number.isFinite(value)).toBe(true);
		}

		// No string/identifier-shaped fields could ever slip through.
		const forbidden = /id|name|path|command|repo|url|user|org|title/i;
		expect(keys.some((key) => forbidden.test(key))).toBe(false);
	});

	it("drops non-finite values instead of emitting them", () => {
		const { deps, calls } = createDeps({
			getUptimeSeconds: () => Number.NaN,
		});
		emitResourceSnapshot(deps);

		expect("uptime_seconds" in calls[0].properties).toBe(false);
	});
});

describe("startMemoryTelemetry cadence", () => {
	it("emits on the ~5-minute cadence and keeps ticking", () => {
		jest.useFakeTimers();
		const { deps, calls } = createDeps();
		startMemoryTelemetry(deps);

		expect(calls).toHaveLength(0);
		jest.advanceTimersByTime(SAMPLE_INTERVAL_MS);
		expect(calls).toHaveLength(1);
		jest.advanceTimersByTime(SAMPLE_INTERVAL_MS);
		expect(calls).toHaveLength(2);
	});

	it("does not create a duplicate timer when started twice", () => {
		jest.useFakeTimers();
		const { deps, calls } = createDeps();
		startMemoryTelemetry(deps);
		startMemoryTelemetry(deps);

		jest.advanceTimersByTime(SAMPLE_INTERVAL_MS);
		expect(calls).toHaveLength(1); // one tick, not two
	});
});

describe("startMemoryTelemetry disabled state", () => {
	it("never schedules or emits when disabled", () => {
		jest.useFakeTimers();
		const { deps, calls } = createDeps({ isEnabled: () => false });
		startMemoryTelemetry(deps);

		jest.advanceTimersByTime(SAMPLE_INTERVAL_MS * 10);
		expect(calls).toHaveLength(0);
	});

	it("is disabled under the test environment by default", () => {
		// NODE_ENV is "test" while this suite runs.
		expect(isMemoryTelemetryEnabled()).toBe(false);

		const prev = process.env.NODE_ENV;
		try {
			process.env.NODE_ENV = "development";
			expect(isMemoryTelemetryEnabled()).toBe(false);
			process.env.NODE_ENV = "production";
			expect(isMemoryTelemetryEnabled()).toBe(true);
		} finally {
			process.env.NODE_ENV = prev;
		}
	});
});

describe("stopMemoryTelemetry cleanup", () => {
	it("stops emitting after cleanup", () => {
		jest.useFakeTimers();
		const { deps, calls } = createDeps();
		startMemoryTelemetry(deps);

		jest.advanceTimersByTime(SAMPLE_INTERVAL_MS);
		expect(calls).toHaveLength(1);

		stopMemoryTelemetry();
		jest.advanceTimersByTime(SAMPLE_INTERVAL_MS * 5);
		expect(calls).toHaveLength(1); // no further ticks
	});

	it("unrefs the pending timer so it can't keep the process alive", () => {
		const unref = mock(() => {});
		const realSetTimeout = globalThis.setTimeout;
		const setTimeoutSpy = mock((fn: () => void, ms?: number) => {
			const handle = realSetTimeout(fn, ms);
			(handle as { unref?: () => void }).unref = unref;
			return handle;
		});
		globalThis.setTimeout = setTimeoutSpy as unknown as typeof setTimeout;
		try {
			const { deps } = createDeps();
			startMemoryTelemetry(deps);
			expect(unref).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.setTimeout = realSetTimeout;
			stopMemoryTelemetry();
		}
	});
});
