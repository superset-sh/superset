export const STARTUP_PERFORMANCE_GET_CHANNEL = "startup-performance:get";
export const STARTUP_PERFORMANCE_RENDERER_MARK_CHANNEL =
	"startup-performance:renderer-mark";

export interface StartupPerformanceRendererMarkPayload {
	name: string;
	rendererElapsedMs?: number;
	href?: string;
	readyState?: string;
}

export interface StartupPerformanceMark {
	name: string;
	elapsedMs: number;
	timestamp: string;
	detail?: Record<string, unknown>;
}

export interface StartupPerformanceDuration {
	from: string;
	to: string;
	durationMs: number;
}

export interface StartupPerformanceReport {
	processStartedAt: string;
	uptimeMs: number;
	marks: StartupPerformanceMark[];
	durations: StartupPerformanceDuration[];
}
