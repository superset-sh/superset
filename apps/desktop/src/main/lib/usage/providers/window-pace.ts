import type { RateLimitWindow } from "../usage-snapshot";

function clampPct(value: number): number {
	if (Number.isNaN(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

/**
 * Estimate whether current burn rate lasts until the window resets. When the
 * window's total duration is known we project usage forward at the average
 * pace; otherwise we degrade to a simple "have we exhausted it yet" check.
 */
export function buildWindow(params: {
	label: string;
	usedPct: number;
	resetAt: Date | null;
	windowMs?: number;
}): RateLimitWindow {
	const usedPct = clampPct(params.usedPct);
	const remainingPct = 100 - usedPct;

	if (!params.resetAt || !params.windowMs) {
		return {
			label: params.label,
			usedPct,
			resetAt: params.resetAt,
			lastsUntilReset: usedPct < 100,
			reservePct: remainingPct,
		};
	}

	const timeToReset = params.resetAt.getTime() - Date.now();
	const elapsed = params.windowMs - timeToReset;
	const elapsedFraction = Math.max(
		0.01,
		Math.min(1, elapsed / params.windowMs),
	);
	const projectedUsedAtReset = usedPct / elapsedFraction;

	return {
		label: params.label,
		usedPct,
		resetAt: params.resetAt,
		lastsUntilReset: projectedUsedAtReset <= 100,
		reservePct: clampPct(100 - projectedUsedAtReset),
	};
}
