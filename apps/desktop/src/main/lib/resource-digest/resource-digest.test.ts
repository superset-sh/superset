import { afterEach, describe, expect, it, jest } from "bun:test";
import {
	ALERT_COOLDOWN_MS,
	IDLE_SKIP_THRESHOLD_SECONDS,
	MIN_SAMPLES_TO_FLUSH_ON_QUIT,
	RESOURCE_ALERT_EVENT,
	RESOURCE_DIGEST_EVENT,
	type ResourceDigestDeps,
	type ResourceSample,
	recordWindowUnresponsive,
	SAMPLE_INTERVAL_MS,
	SAMPLE_KEYS,
	startResourceDigest,
	stopResourceDigest,
} from "./resource-digest";

type TrackCall = { event: string; properties: Record<string, unknown> };

const DAY_MS = 24 * 60 * 60_000;
// Deps use random: () => 0, so every tick is scheduled at exactly the
// interval; advancing by exactly that never double-fires.
const TICK_MS = SAMPLE_INTERVAL_MS;

function makeSample(overrides: Partial<ResourceSample> = {}): ResourceSample {
	const sample = { uptime_seconds: 60 } as ResourceSample;
	for (const key of SAMPLE_KEYS) sample[key] = 0;
	return { ...sample, ...overrides };
}

function createDeps(overrides: Partial<ResourceDigestDeps> = {}): {
	deps: ResourceDigestDeps;
	calls: TrackCall[];
	clock: { epochMs: number };
} {
	const calls: TrackCall[] = [];
	const clock = { epochMs: Date.UTC(2026, 0, 5, 12, 0, 0) };
	const deps: ResourceDigestDeps = {
		getSample: async () => makeSample(),
		getIdleSeconds: () => 0,
		track: (event, properties) => calls.push({ event, properties }),
		isEnabled: () => true,
		now: () => clock.epochMs,
		random: () => 0,
		...overrides,
	};
	return { deps, calls, clock };
}

/** Fire one sampler tick and let the async sample settle. */
async function tick(
	clock: { epochMs: number },
	advanceDayMs = 0,
): Promise<void> {
	clock.epochMs += advanceDayMs;
	jest.advanceTimersByTime(TICK_MS);
	// takeSample is async; drain microtasks so the sample lands before asserting.
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

afterEach(() => {
	stopResourceDigest();
	jest.useRealTimers();
});

describe("daily digest", () => {
	it("aggregates samples into p50/p90/max and flushes on day rollover", async () => {
		jest.useFakeTimers();
		const values = [100, 200, 300, 400, 500];
		let index = 0;
		const { deps, calls, clock } = createDeps({
			getSample: async () =>
				makeSample({
					electron_renderer_rss_bytes: values[index++ % values.length] ?? 0,
					uptime_seconds: index * 60,
				}),
		});
		startResourceDigest(deps);

		for (let i = 0; i < values.length; i++) await tick(clock);
		expect(calls).toHaveLength(0);

		// Crossing the UTC day boundary flushes the previous day.
		await tick(clock, DAY_MS);
		const digests = calls.filter((c) => c.event === RESOURCE_DIGEST_EVENT);
		expect(digests).toHaveLength(1);
		const props = digests[0]?.properties as Record<string, number>;
		expect(props.sample_count).toBe(values.length);
		expect(props.electron_renderer_rss_bytes_p50).toBe(300);
		expect(props.electron_renderer_rss_bytes_max).toBe(500);
		expect(props.uptime_seconds_max).toBe(values.length * 60);
		expect(props.flushed_on_quit).toBe(0);
		expect(props.active_minutes).toBe(values.length * 5);
	});

	it("emits only finite numbers under allowlisted digest keys", async () => {
		jest.useFakeTimers();
		const { deps, calls, clock } = createDeps({
			getSample: async () =>
				makeSample({
					electron_total_rss_bytes: Number.NaN,
					children_rss_bytes: -5,
				}),
		});
		startResourceDigest(deps);
		await tick(clock);
		await tick(clock, DAY_MS);

		const props = calls[0]?.properties as Record<string, unknown>;
		expect(props).toBeDefined();
		for (const [key, value] of Object.entries(props)) {
			expect(typeof value).toBe("number");
			expect(Number.isFinite(value)).toBe(true);
			expect(
				SAMPLE_KEYS.some((k) => key.startsWith(`${k}_`)) ||
					[
						"sample_count",
						"active_minutes",
						"uptime_seconds_max",
						"unresponsive_count",
						"flushed_on_quit",
					].includes(key),
			).toBe(true);
		}
		// NaN and negative inputs normalize to 0 rather than leaking through.
		expect(props.electron_total_rss_bytes_max).toBe(0);
		expect(props.children_rss_bytes_max).toBe(0);
	});

	it("skips samples while the machine is idle", async () => {
		jest.useFakeTimers();
		let idle = 0;
		let sampleCalls = 0;
		const { deps, clock } = createDeps({
			getIdleSeconds: () => idle,
			getSample: async () => {
				sampleCalls += 1;
				return makeSample();
			},
		});
		startResourceDigest(deps);

		await tick(clock);
		idle = IDLE_SKIP_THRESHOLD_SECONDS + 1;
		await tick(clock);
		await tick(clock);
		idle = 0;
		await tick(clock);

		expect(sampleCalls).toBe(2);
	});

	it("flushes a partial day on stop, but drops digests below the quit minimum", async () => {
		jest.useFakeTimers();
		const first = createDeps();
		startResourceDigest(first.deps);
		for (let i = 0; i < MIN_SAMPLES_TO_FLUSH_ON_QUIT; i++)
			await tick(first.clock);
		stopResourceDigest();
		expect(
			first.calls.filter((c) => c.event === RESOURCE_DIGEST_EVENT),
		).toHaveLength(1);
		expect(first.calls[0]?.properties.flushed_on_quit).toBe(1);

		const second = createDeps();
		startResourceDigest(second.deps);
		await tick(second.clock);
		stopResourceDigest();
		expect(
			second.calls.filter((c) => c.event === RESOURCE_DIGEST_EVENT),
		).toHaveLength(0);
	});

	it("does not start when disabled and never double-starts", async () => {
		jest.useFakeTimers();
		const disabled = createDeps({ isEnabled: () => false });
		startResourceDigest(disabled.deps);
		await tick(disabled.clock);
		stopResourceDigest();
		expect(disabled.calls).toHaveLength(0);

		let sampleCalls = 0;
		const { deps, clock } = createDeps({
			getSample: async () => {
				sampleCalls += 1;
				return makeSample();
			},
		});
		startResourceDigest(deps);
		startResourceDigest(deps);
		await tick(clock);
		expect(sampleCalls).toBe(1);
	});
});

describe("alerts", () => {
	it("emits a threshold alert with the sample payload, honoring the cooldown", async () => {
		jest.useFakeTimers();
		const { deps, calls, clock } = createDeps({
			getSample: async () => makeSample({ electron_renderer_rss_bytes: 4e9 }),
		});
		startResourceDigest(deps);

		await tick(clock);
		await tick(clock);
		let alerts = calls.filter((c) => c.event === RESOURCE_ALERT_EVENT);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.properties.alert_kind).toBe("renderer_rss_high");
		expect(alerts[0]?.properties.electron_renderer_rss_bytes).toBe(4e9);

		// Past the cooldown the same condition may alert again.
		await tick(clock, ALERT_COOLDOWN_MS);
		alerts = calls.filter((c) => c.event === RESOURCE_ALERT_EVENT);
		expect(alerts).toHaveLength(2);
	});

	it("counts unresponsive episodes into the digest and alerts once per cooldown", async () => {
		jest.useFakeTimers();
		const { deps, calls, clock } = createDeps();
		startResourceDigest(deps);
		await tick(clock);

		recordWindowUnresponsive();
		recordWindowUnresponsive();

		const alerts = calls.filter((c) => c.event === RESOURCE_ALERT_EVENT);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.properties.alert_kind).toBe("window_unresponsive");

		await tick(clock, DAY_MS);
		const digest = calls.find((c) => c.event === RESOURCE_DIGEST_EVENT);
		expect(digest?.properties.unresponsive_count).toBe(2);
	});

	it("is a no-op for unresponsive episodes when not running", () => {
		const { calls } = createDeps();
		recordWindowUnresponsive();
		expect(calls).toHaveLength(0);
	});
});
