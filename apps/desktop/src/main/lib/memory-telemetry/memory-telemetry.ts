// Namespace import (not named) so this module links even when a test replaces
// the `electron` mock with a shape missing some exports — the real values are
// only dereferenced lazily inside defaultDeps at runtime.
import * as electron from "electron";
import { track } from "main/lib/analytics";
import { DEFAULT_TELEMETRY_ENABLED } from "shared/constants";

/**
 * Privacy-safe aggregate memory telemetry (SUPER-1550).
 *
 * Every ~5 minutes the main process emits one flat, numbers-only
 * `resource_snapshot` event so the fleet has memory percentiles to reason
 * about (renderer RSS vs process/window/webview counts, release regressions,
 * before/after proof for perf fixes).
 *
 * Hard privacy rules — the payload NEVER contains IDs, names, paths, commands,
 * repo/terminal/user data, or anything derived from them. It is only Electron
 * process-class RSS (via `app.getAppMetrics()`, no subprocess), this process's
 * heap/RSS (`process.memoryUsage()`), uptime, and a handful of bounded counts.
 * Sampling never spawns `ps` — `getAppMetrics()` reads Electron internals.
 */
export const RESOURCE_SNAPSHOT_EVENT = "resource_snapshot";

export const SAMPLE_INTERVAL_MS = 5 * 60_000;
// Up to 60s of extra delay per tick so the fleet never emits in lockstep.
export const SAMPLE_JITTER_MS = 60_000;

/**
 * The complete set of properties this event may ever carry. Emission filters
 * the payload down to exactly these keys, and each value must be a finite
 * number — a hard allowlist that makes leaking non-aggregate data impossible.
 */
export const RESOURCE_SNAPSHOT_KEYS = [
	"uptime_seconds",
	"process_rss_bytes",
	"process_heap_used_bytes",
	"process_heap_total_bytes",
	"process_external_bytes",
	"process_array_buffers_bytes",
	"electron_total_rss_bytes",
	"electron_main_rss_bytes",
	"electron_renderer_rss_bytes",
	"electron_other_rss_bytes",
	"electron_process_count",
	"electron_main_process_count",
	"electron_renderer_process_count",
	"electron_other_process_count",
	"window_count",
	"web_contents_count",
] as const;

export type ResourceSnapshotKey = (typeof RESOURCE_SNAPSHOT_KEYS)[number];
export type ResourceSnapshot = Record<ResourceSnapshotKey, number>;

export interface MemoryTelemetryDeps {
	getAppMetrics: () => Electron.ProcessMetric[];
	getMemoryUsage: () => NodeJS.MemoryUsage;
	getUptimeSeconds: () => number;
	getWindowCount: () => number;
	getWebContentsCount: () => number;
	track: (event: string, properties: Record<string, number>) => void;
	isEnabled: () => boolean;
	random: () => number;
}

function normalizeBytes(value: number | undefined): number {
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
export function isMemoryTelemetryEnabled(): boolean {
	const nodeEnv = process.env.NODE_ENV;
	if (nodeEnv === "test" || nodeEnv === "development") return false;
	return DEFAULT_TELEMETRY_ENABLED;
}

const defaultDeps: MemoryTelemetryDeps = {
	getAppMetrics: () => electron.app.getAppMetrics(),
	getMemoryUsage: () => process.memoryUsage(),
	getUptimeSeconds: () => process.uptime(),
	getWindowCount: () => electron.BrowserWindow.getAllWindows().length,
	getWebContentsCount: () => electron.webContents.getAllWebContents().length,
	track,
	isEnabled: isMemoryTelemetryEnabled,
	random: Math.random,
};

// Electron reports `workingSetSize` in KB, hence the `* 1024`.
export function buildResourceSnapshot(
	deps: MemoryTelemetryDeps,
): ResourceSnapshot {
	const mem = deps.getMemoryUsage();

	let mainRss = 0;
	let rendererRss = 0;
	let otherRss = 0;
	let mainCount = 0;
	let rendererCount = 0;
	let otherCount = 0;

	for (const proc of deps.getAppMetrics()) {
		const rss = normalizeBytes(proc.memory?.workingSetSize) * 1024;
		if (proc.type === "Browser") {
			mainRss += rss;
			mainCount += 1;
		} else if (
			typeof proc.type === "string" &&
			isRendererProcessType(proc.type)
		) {
			rendererRss += rss;
			rendererCount += 1;
		} else {
			otherRss += rss;
			otherCount += 1;
		}
	}

	return {
		uptime_seconds: Math.round(deps.getUptimeSeconds()),
		process_rss_bytes: normalizeBytes(mem.rss),
		process_heap_used_bytes: normalizeBytes(mem.heapUsed),
		process_heap_total_bytes: normalizeBytes(mem.heapTotal),
		process_external_bytes: normalizeBytes(mem.external),
		process_array_buffers_bytes: normalizeBytes(mem.arrayBuffers),
		electron_total_rss_bytes: mainRss + rendererRss + otherRss,
		electron_main_rss_bytes: mainRss,
		electron_renderer_rss_bytes: rendererRss,
		electron_other_rss_bytes: otherRss,
		electron_process_count: mainCount + rendererCount + otherCount,
		electron_main_process_count: mainCount,
		electron_renderer_process_count: rendererCount,
		electron_other_process_count: otherCount,
		window_count: deps.getWindowCount(),
		web_contents_count: deps.getWebContentsCount(),
	};
}

/**
 * Emit one snapshot, filtered to exactly the allowlisted numeric keys.
 * Honors the enabled gate itself so any direct caller can't bypass it.
 */
export function emitResourceSnapshot(deps: MemoryTelemetryDeps): void {
	if (!deps.isEnabled()) return;
	const snapshot = buildResourceSnapshot(deps);
	const payload: Record<string, number> = {};
	for (const key of RESOURCE_SNAPSHOT_KEYS) {
		const value = snapshot[key];
		if (typeof value === "number" && Number.isFinite(value)) {
			payload[key] = value;
		}
	}
	deps.track(RESOURCE_SNAPSHOT_EVENT, payload);
}

let sampleTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function scheduleNext(deps: MemoryTelemetryDeps): void {
	const delay =
		SAMPLE_INTERVAL_MS + Math.floor(deps.random() * SAMPLE_JITTER_MS);
	sampleTimer = setTimeout(() => {
		try {
			emitResourceSnapshot(deps);
		} catch {
			// Telemetry must never crash the app; drop the sample.
		}
		if (running) scheduleNext(deps);
	}, delay);
	// Never keep the process alive for a telemetry sample.
	sampleTimer.unref?.();
}

/**
 * Start the periodic sampler. Idempotent: a second call while already running
 * is a no-op, so startup + HMR re-entry can't create duplicate timers.
 */
export function startMemoryTelemetry(
	overrides?: Partial<MemoryTelemetryDeps>,
): void {
	if (running) return;
	const deps = { ...defaultDeps, ...overrides };
	if (!deps.isEnabled()) return;
	running = true;
	scheduleNext(deps);
}

/** Stop the sampler and clear the pending timer. */
export function stopMemoryTelemetry(): void {
	running = false;
	if (sampleTimer) {
		clearTimeout(sampleTimer);
		sampleTimer = null;
	}
}
