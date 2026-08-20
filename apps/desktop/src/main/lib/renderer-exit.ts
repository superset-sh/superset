// Renderer terminations that happen in normal operation: `clean-exit` is the
// renderer going away on quit, `killed` is a deliberate termination such as a
// reload or a window teardown. Neither is a crash, and reporting them files an
// error-level event on ordinary app usage.
//
// Everything else — `crashed`, `oom`, `launch-failed`, `integrity-failure`,
// `abnormal-exit` — is a real fault and must keep reporting.
const EXPECTED_RENDERER_EXIT_REASONS = new Set(["clean-exit", "killed"]);

/**
 * Whether a `render-process-gone` reason is ordinary app lifecycle rather than
 * a crash. Exclude-list on purpose: an unrecognised reason, including one a
 * future Electron adds, is treated as a fault and still reports.
 */
export function isExpectedRendererExit(reason: string): boolean {
	return EXPECTED_RENDERER_EXIT_REASONS.has(reason);
}
