// Namespace import (not named) so this module links even when a test replaces
// the `electron` mock with a shape missing some exports — the real values are
// only dereferenced lazily inside defaultDeps at runtime.

import { monitorEventLoopDelay } from "node:perf_hooks";
import * as electron from "electron";
import { track } from "main/lib/analytics";
import { DEFAULT_TELEMETRY_ENABLED } from "shared/constants";

/**
 * Privacy-safe aggregate resource telemetry, digest edition (SUPER-1550).
 *
 * The original `resource_snapshot` sampler (#5777) uploaded every raw 5-minute
 * sample and was removed in #5964 for doubling PostHog ingestion with
 * machine-cadence events. This module keeps the same 5-minute sampling but
 * aggregates locally and uploads:
 *
 * - one `resource_digest` event per machine per UTC day (p50/p90/max per
 *   metric), plus a partial digest on quit, and
 * - rare `resource_alert` events when a sample crosses a severity threshold,
 *   rate-limited by a per-kind cooldown.
 *
 * Sampling contributes nothing while the machine has been idle for 30+
 * minutes, so a desktop idling over the weekend goes silent instead of
 * emitting all weekend (the other #5964 objection).
 *
 * Hard privacy rules — payloads NEVER contain IDs, names, paths, commands,
 * repo/terminal/user data, or anything derived from them. Digest properties
 * are filtered through a numeric-key allowlist; the only string an alert may
 * carry is its `alert_kind`, drawn from the fixed enum below.
 */
export const RESOURCE_DIGEST_EVENT = "resource_digest";
export const RESOURCE_ALERT_EVENT = "resource_alert";

export const SAMPLE_INTERVAL_MS = 5 * 60_000;
// Up to 60s of extra delay per tick so the fleet never emits in lockstep.
export const SAMPLE_JITTER_MS = 60_000;
export const IDLE_SKIP_THRESHOLD_SECONDS = 30 * 60;
export const ALERT_COOLDOWN_MS = 6 * 60 * 60_000;
/** A quit-time partial digest below this many samples is noise; drop it. */
export const MIN_SAMPLES_TO_FLUSH_ON_QUIT = 3;
/** Hard bound on retained samples per day (a full day is 288). */
const MAX_SAMPLES_PER_DAY = 512;

/** Per-sample metrics aggregated into p50/p90/max in the daily digest. */
export const SAMPLE_KEYS = [
	"electron_total_rss_bytes",
	"electron_main_rss_bytes",
	"electron_renderer_rss_bytes",
	"electron_other_rss_bytes",
	"electron_process_count",
	"window_count",
	"web_contents_count",
	"process_heap_used_bytes",
	"process_external_bytes",
	"children_rss_bytes",
	"children_process_count",
	"host_memory_used_percent",
	"host_load_average_1m",
	"event_loop_p99_ms",
] as const;

export type SampleKey = (typeof SAMPLE_KEYS)[number];
export type ResourceSample = Record<SampleKey, number> & {
	uptime_seconds: number;
};

/** Scalar digest properties emitted alongside the aggregated keys. */
export const DIGEST_SCALAR_KEYS = [
	"sample_count",
	"active_minutes",
	"uptime_seconds_max",
	"unresponsive_count",
	"flushed_on_quit",
] as const;

export const ALERT_KINDS = [
	"renderer_rss_high",
	"total_rss_high",
	"children_rss_high",
	"host_memory_pressure",
	"main_event_loop_stall",
	"window_unresponsive",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const ALERT_THRESHOLDS: Record<
	Exclude<AlertKind, "window_unresponsive">,
	{ key: SampleKey; above: number }
> = {
	renderer_rss_high: { key: "electron_renderer_rss_bytes", above: 3e9 },
	total_rss_high: { key: "electron_total_rss_bytes", above: 5e9 },
	children_rss_high: { key: "children_rss_bytes", above: 16e9 },
	host_memory_pressure: { key: "host_memory_used_percent", above: 92 },
	main_event_loop_stall: { key: "event_loop_p99_ms", above: 1_000 },
};

export interface ResourceDigestDeps {
	getSample: () => Promise<ResourceSample>;
	getIdleSeconds: () => number;
	track: (event: string, properties: Record<string, unknown>) => void;
	isEnabled: () => boolean;
	now: () => number;
	random: () => number;
}

function normalizeNumber(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: 0;
}

function isRendererProcessType(type: string): boolean {
	const normalized = type.toLowerCase();
	return normalized === "renderer" || normalized === "tab";
}

/**
 * Telemetry is off in test and dev so analytics only reflects real usage, and
 * honors the global telemetry-enabled flag. `track()` additionally no-ops
 * until a user is identified and a PostHog key is configured.
 */
export function isResourceDigestEnabled(): boolean {
	const nodeEnv = process.env.NODE_ENV;
	if (nodeEnv === "test" || nodeEnv === "development") return false;
	return DEFAULT_TELEMETRY_ENABLED;
}

// The event-loop-delay histogram is cheap (kernel timer wheel sampling) and
// lives for the process; each sample reads p99 and resets it.
const loopDelayHistogram = monitorEventLoopDelay({ resolution: 20 });
loopDelayHistogram.enable();

async function collectDefaultSample(): Promise<ResourceSample> {
	let mainRss = 0;
	let rendererRss = 0;
	let otherRss = 0;
	let processCount = 0;

	// Electron reports `workingSetSize` in KB, hence the `* 1024`.
	for (const proc of electron.app.getAppMetrics()) {
		const rss = normalizeNumber(proc.memory?.workingSetSize) * 1024;
		processCount += 1;
		if (proc.type === "Browser") {
			mainRss += rss;
		} else if (
			typeof proc.type === "string" &&
			isRendererProcessType(proc.type)
		) {
			rendererRss += rss;
		} else {
			otherRss += rss;
		}
	}

	// Child-process totals (host-service, pty trees, agents) come from the
	// existing UI collector. Only workspace-level numeric totals are read;
	// every identifying field stays behind in the snapshot.
	let childrenRss = 0;
	let childrenCount = 0;
	let hostMemoryUsedPercent = 0;
	let hostLoadAverage = 0;
	try {
		const { collectResourceMetrics } = await import(
			"main/lib/resource-metrics"
		);
		const snapshot = await collectResourceMetrics({ mode: "idle" });
		for (const workspace of snapshot.workspaces) {
			childrenRss += normalizeNumber(workspace.memory);
			childrenCount += workspace.sessions.length;
		}
		hostMemoryUsedPercent = normalizeNumber(snapshot.host.memoryUsagePercent);
		hostLoadAverage = normalizeNumber(snapshot.host.loadAverage1m);
	} catch {
		// Child-tree sampling is best-effort; Electron-side numbers still count.
	}

	const loopP99Ms = normalizeNumber(loopDelayHistogram.percentile(99) / 1e6);
	loopDelayHistogram.reset();

	const mem = process.memoryUsage();

	return {
		electron_total_rss_bytes: mainRss + rendererRss + otherRss,
		electron_main_rss_bytes: mainRss,
		electron_renderer_rss_bytes: rendererRss,
		electron_other_rss_bytes: otherRss,
		electron_process_count: processCount,
		window_count: electron.BrowserWindow.getAllWindows().length,
		web_contents_count: electron.webContents.getAllWebContents().length,
		process_heap_used_bytes: normalizeNumber(mem.heapUsed),
		process_external_bytes: normalizeNumber(mem.external),
		children_rss_bytes: childrenRss,
		children_process_count: childrenCount,
		host_memory_used_percent: hostMemoryUsedPercent,
		host_load_average_1m: hostLoadAverage,
		event_loop_p99_ms: loopP99Ms,
		uptime_seconds: Math.round(process.uptime()),
	};
}

const defaultDeps: ResourceDigestDeps = {
	getSample: collectDefaultSample,
	getIdleSeconds: () => electron.powerMonitor.getSystemIdleTime(),
	track,
	isEnabled: isResourceDigestEnabled,
	now: Date.now,
	random: Math.random,
};

interface DayAggregate {
	dayKey: string;
	samples: Record<SampleKey, number[]>;
	sampleCount: number;
	uptimeSecondsMax: number;
	unresponsiveCount: number;
}

function emptyAggregate(dayKey: string): DayAggregate {
	const samples = {} as Record<SampleKey, number[]>;
	for (const key of SAMPLE_KEYS) samples[key] = [];
	return {
		dayKey,
		samples,
		sampleCount: 0,
		uptimeSecondsMax: 0,
		unresponsiveCount: 0,
	};
}

function utcDayKey(epochMs: number): string {
	return new Date(epochMs).toISOString().slice(0, 10);
}

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.floor(q * (sorted.length - 1) + 0.5),
	);
	return sorted[index] ?? 0;
}

let running = false;
let sampleTimer: ReturnType<typeof setTimeout> | null = null;
let aggregate: DayAggregate | null = null;
let activeDeps: ResourceDigestDeps = defaultDeps;
const lastAlertAt = new Map<AlertKind, number>();

function buildDigestPayload(
	agg: DayAggregate,
	flushedOnQuit: boolean,
): Record<string, number> {
	const payload: Record<string, number> = {};
	for (const key of SAMPLE_KEYS) {
		const sorted = [...agg.samples[key]].sort((a, b) => a - b);
		payload[`${key}_p50`] = quantile(sorted, 0.5);
		payload[`${key}_p90`] = quantile(sorted, 0.9);
		payload[`${key}_max`] = sorted[sorted.length - 1] ?? 0;
	}
	payload.sample_count = agg.sampleCount;
	payload.active_minutes = Math.round(
		(agg.sampleCount * SAMPLE_INTERVAL_MS) / 60_000,
	);
	payload.uptime_seconds_max = agg.uptimeSecondsMax;
	payload.unresponsive_count = agg.unresponsiveCount;
	payload.flushed_on_quit = flushedOnQuit ? 1 : 0;

	// Belt-and-braces: every value must be a finite number or the key is
	// dropped, so non-aggregate data can never ride along.
	for (const [key, value] of Object.entries(payload)) {
		if (typeof value !== "number" || !Number.isFinite(value)) {
			delete payload[key];
		}
	}
	return payload;
}

function flushAggregate(
	deps: ResourceDigestDeps,
	flushedOnQuit: boolean,
): void {
	if (!aggregate || aggregate.sampleCount === 0) return;
	if (flushedOnQuit && aggregate.sampleCount < MIN_SAMPLES_TO_FLUSH_ON_QUIT) {
		aggregate = null;
		return;
	}
	deps.track(
		RESOURCE_DIGEST_EVENT,
		buildDigestPayload(aggregate, flushedOnQuit),
	);
	aggregate = null;
}

function maybeEmitAlert(
	deps: ResourceDigestDeps,
	kind: AlertKind,
	sample: ResourceSample | null,
): void {
	const nowMs = deps.now();
	const last = lastAlertAt.get(kind);
	if (last !== undefined && nowMs - last < ALERT_COOLDOWN_MS) return;
	lastAlertAt.set(kind, nowMs);

	const payload: Record<string, unknown> = { alert_kind: kind };
	if (sample) {
		for (const key of SAMPLE_KEYS) {
			const value = sample[key];
			if (typeof value === "number" && Number.isFinite(value)) {
				payload[key] = value;
			}
		}
	}
	deps.track(RESOURCE_ALERT_EVENT, payload);
}

function evaluateAlerts(
	deps: ResourceDigestDeps,
	sample: ResourceSample,
): void {
	for (const [kind, threshold] of Object.entries(ALERT_THRESHOLDS) as Array<
		[AlertKind, { key: SampleKey; above: number }]
	>) {
		if (sample[threshold.key] > threshold.above) {
			maybeEmitAlert(deps, kind, sample);
		}
	}
}

async function takeSample(deps: ResourceDigestDeps): Promise<void> {
	const nowKey = utcDayKey(deps.now());
	if (aggregate && aggregate.dayKey !== nowKey) {
		flushAggregate(deps, false);
	}

	// Idle machines still roll the day over (above) but contribute no samples.
	if (deps.getIdleSeconds() > IDLE_SKIP_THRESHOLD_SECONDS) return;

	const sample = await deps.getSample();
	if (!aggregate) aggregate = emptyAggregate(nowKey);
	if (aggregate.sampleCount >= MAX_SAMPLES_PER_DAY) return;

	for (const key of SAMPLE_KEYS) {
		aggregate.samples[key].push(normalizeNumber(sample[key]));
	}
	aggregate.sampleCount += 1;
	aggregate.uptimeSecondsMax = Math.max(
		aggregate.uptimeSecondsMax,
		normalizeNumber(sample.uptime_seconds),
	);

	evaluateAlerts(deps, sample);
}

function scheduleNext(deps: ResourceDigestDeps): void {
	const delay =
		SAMPLE_INTERVAL_MS + Math.floor(deps.random() * SAMPLE_JITTER_MS);
	sampleTimer = setTimeout(() => {
		void takeSample(deps)
			.catch(() => {
				// Telemetry must never crash the app; drop the sample.
			})
			.finally(() => {
				if (running) scheduleNext(deps);
			});
	}, delay);
	// Never keep the process alive for a telemetry sample.
	sampleTimer.unref?.();
}

/**
 * Start the periodic sampler. Idempotent: a second call while already running
 * is a no-op, so startup + HMR re-entry can't create duplicate timers.
 */
export function startResourceDigest(
	overrides?: Partial<ResourceDigestDeps>,
): void {
	if (running) return;
	const deps = { ...defaultDeps, ...overrides };
	if (!deps.isEnabled()) return;
	running = true;
	activeDeps = deps;
	scheduleNext(deps);
}

/**
 * Stop the sampler and flush the partial day (dropped when it holds fewer
 * than MIN_SAMPLES_TO_FLUSH_ON_QUIT samples). Called from before-quit.
 */
export function stopResourceDigest(): void {
	const wasRunning = running;
	running = false;
	if (sampleTimer) {
		clearTimeout(sampleTimer);
		sampleTimer = null;
	}
	if (wasRunning) flushAggregate(activeDeps, true);
	aggregate = null;
	lastAlertAt.clear();
}

/**
 * Count a main-window unresponsive episode into the daily digest and emit a
 * (cooldown-limited) alert. Wired from the window's `unresponsive` handler;
 * safe to call when the sampler is disabled or not running.
 */
export function recordWindowUnresponsive(): void {
	if (!running) return;
	if (!aggregate) aggregate = emptyAggregate(utcDayKey(activeDeps.now()));
	aggregate.unresponsiveCount += 1;
	maybeEmitAlert(activeDeps, "window_unresponsive", null);
}
