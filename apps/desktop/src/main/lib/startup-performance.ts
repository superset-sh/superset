import { performance } from "node:perf_hooks";
import type {
	StartupPerformanceDuration,
	StartupPerformanceMark,
	StartupPerformanceReport,
} from "shared/startup-performance";

const processStartedAtMs = performance.timeOrigin;
const marks: StartupPerformanceMark[] = [createMark("main:process-start", 0)];

function timestampFromElapsed(elapsedMs: number): string {
	return new Date(processStartedAtMs + elapsedMs).toISOString();
}

function createMark(
	name: string,
	elapsedMs = performance.now(),
	detail?: Record<string, unknown>,
): StartupPerformanceMark {
	return {
		name,
		elapsedMs,
		timestamp: timestampFromElapsed(elapsedMs),
		...(detail && { detail }),
	};
}

export function markStartup(
	name: string,
	detail?: Record<string, unknown>,
): void {
	marks.push(createMark(name, performance.now(), detail));
}

export function getStartupPerformanceReport(): StartupPerformanceReport {
	const sortedMarks = [...marks].sort((left, right) => {
		if (left.elapsedMs !== right.elapsedMs)
			return left.elapsedMs - right.elapsedMs;
		return left.name.localeCompare(right.name);
	});
	const durations: StartupPerformanceDuration[] = [];

	for (let index = 1; index < sortedMarks.length; index += 1) {
		const previous = sortedMarks[index - 1];
		const current = sortedMarks[index];
		if (!previous || !current) continue;
		durations.push({
			from: previous.name,
			to: current.name,
			durationMs: current.elapsedMs - previous.elapsedMs,
		});
	}

	return {
		processStartedAt: timestampFromElapsed(0),
		uptimeMs: performance.now(),
		marks: sortedMarks,
		durations,
	};
}
