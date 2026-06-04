export function recordTransientErrorInWindow(
	timestamps: number[],
	now: number,
	windowMs: number,
): number {
	const cutoff = now - windowMs;
	timestamps.push(now);

	// Timestamps are recorded in time order; drop entries that are outside window.
	while (timestamps.length > 0 && timestamps[0] < cutoff) {
		timestamps.shift();
	}

	return timestamps.length;
}
