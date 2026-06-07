export const POMODORO_CYCLE_MINUTES = 25;

/**
 * "⏱ 2h13m · 🍅 13/25m · pomo #6" — elapsed time since the workspace was
 * created, position inside the current 25-minute pomodoro, and which
 * pomodoro is running. Pure so the math stays testable.
 */
export function formatPomodoroLine(createdAt: number, now: number): string {
	const elapsedMinutes = Math.max(0, Math.floor((now - createdAt) / 60_000));
	const hours = Math.floor(elapsedMinutes / 60);
	const minutes = elapsedMinutes % 60;
	const elapsed = hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
	const cycleMinute = elapsedMinutes % POMODORO_CYCLE_MINUTES;
	const pomodoroNumber =
		Math.floor(elapsedMinutes / POMODORO_CYCLE_MINUTES) + 1;
	return `⏱ ${elapsed} · 🍅 ${cycleMinute}/${POMODORO_CYCLE_MINUTES}m · pomo #${pomodoroNumber}`;
}

/** "14:05" — local wall-clock time. */
export function formatClockLine(now: number): string {
	const date = new Date(now);
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}
