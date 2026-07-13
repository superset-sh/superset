import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { env } from "renderer/env.renderer";

/**
 * Enablement for the status-grouped workspace sidebar (Working / Waiting /
 * Open PR / Done / Idle grouping). Production rollout is gated by the
 * `status-grouped-sidebar-access` PostHog flag (default off / server-driven).
 * Dev builds are always on so the feature is visible locally without adding
 * yourself to the flag — mirrors the v2 rollout in `useIsV2CloudEnabled`.
 * Read it everywhere via this hook.
 */
export function useStatusGroupedSidebarEnabled(): boolean {
	const flagEnabled = useFeatureFlagEnabled(
		FEATURE_FLAGS.STATUS_GROUPED_SIDEBAR,
	);
	return !!flagEnabled || env.NODE_ENV === "development";
}
