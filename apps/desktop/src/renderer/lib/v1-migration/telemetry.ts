import type { KindSummary } from "./summary";

const KINDS = [
	"projects",
	"workspaces",
	"presets",
	"settings",
	"terminals",
] as const;

export interface V1MigrationSummaryLike
	extends Record<(typeof KINDS)[number], KindSummary> {
	gateComplete: boolean;
}

/**
 * Flatten a pass summary into snake_case numeric event properties so the
 * PostHog side can aggregate per-kind counts without unpacking objects.
 */
export function v1MigrationEventProps(
	summary: V1MigrationSummaryLike,
): Record<string, number | boolean> {
	const props: Record<string, number | boolean> = {
		gate_complete: summary.gateComplete,
	};
	for (const kind of KINDS) {
		const s = summary[kind];
		props[`${kind}_migrated`] = s.migrated;
		props[`${kind}_linked`] = s.linked;
		props[`${kind}_skipped`] = s.skipped;
		props[`${kind}_failed`] = s.failed;
		props[`${kind}_deferred`] = s.deferred;
	}
	return props;
}
