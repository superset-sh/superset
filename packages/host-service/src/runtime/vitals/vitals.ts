import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const VITALS_INTERVAL_MS = 60_000;
const LOOP_DELAY_RESOLUTION_MS = 20;
const BYTES_PER_MB = 1024 * 1024;
const NS_PER_MS = 1_000_000;

function toMb(bytes: number): number {
	return Math.round((bytes / BYTES_PER_MB) * 10) / 10;
}

// Each sample includes the sampling timer's own interval; an idle loop reads
// as the resolution, not zero.
function loopDelayMs(nanoseconds: number): number {
	return Math.max(
		0,
		Math.round(nanoseconds / NS_PER_MS) - LOOP_DELAY_RESOLUTION_MS,
	);
}

function countByType(types: string[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const type of types) counts[type] = (counts[type] ?? 0) + 1;
	return counts;
}

/**
 * Logs one `[host-service:vitals]` JSON line a minute to stdout, which lands
 * in host-service.log. Returns a stop function.
 */
export function startVitalsLog(): () => void {
	const loopDelay = monitorEventLoopDelay({
		resolution: LOOP_DELAY_RESOLUTION_MS,
	});
	loopDelay.enable();
	let lastUtilization = performance.eventLoopUtilization();

	const timer = setInterval(() => {
		try {
			const utilization = performance.eventLoopUtilization();
			const memory = process.memoryUsage();
			const vitals = {
				at: new Date().toISOString(),
				pid: process.pid,
				uptimeSeconds: Math.round(process.uptime()),
				memoryMb: {
					rss: toMb(memory.rss),
					heapUsed: toMb(memory.heapUsed),
					heapTotal: toMb(memory.heapTotal),
					external: toMb(memory.external),
					arrayBuffers: toMb(memory.arrayBuffers),
				},
				eventLoop: {
					delayP50Ms: loopDelayMs(loopDelay.percentile(50)),
					delayP99Ms: loopDelayMs(loopDelay.percentile(99)),
					delayMaxMs: loopDelayMs(loopDelay.max),
					busyShare:
						Math.round(
							performance.eventLoopUtilization(utilization, lastUtilization)
								.utilization * 100,
						) / 100,
				},
				activeResources: countByType(process.getActiveResourcesInfo()),
			};
			lastUtilization = utilization;
			loopDelay.reset();
			console.log(`[host-service:vitals] ${JSON.stringify(vitals)}`);
		} catch (error) {
			console.warn("[host-service:vitals] sample failed:", error);
		}
	}, VITALS_INTERVAL_MS);
	timer.unref();

	return () => {
		clearInterval(timer);
		loopDelay.disable();
	};
}
