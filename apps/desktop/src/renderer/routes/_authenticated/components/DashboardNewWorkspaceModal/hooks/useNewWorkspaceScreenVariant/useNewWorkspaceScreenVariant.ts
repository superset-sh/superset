import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled, usePostHog } from "posthog-js/react";
import { useLayoutEffect, useState } from "react";

/**
 * Assigns the new-workspace-screen experiment arm. Calls `getFeatureFlag`
 * imperatively (not `useFeatureFlagVariantKey`) so the `$feature_flag_called`
 * exposure event fires only when a user actually reaches the new-workspace
 * surface — never on app load.
 *
 * Eligibility (new accounts only) lives on the flag itself: a release
 * condition on the `created_at` person property, which the renderer sends
 * with flag requests at identify time (PostHogUserIdentifier). Ineligible
 * accounts — and old builds that never send `created_at` — get `false` back,
 * which renders control; a non-variant response is not counted as experiment
 * exposure.
 *
 * The override flag short-circuits everything: it forces the screen without
 * ever evaluating the experiment flag, so overridden users (team, dev
 * accounts) emit no experiment exposure and cannot contaminate results.
 *
 * Returns null while unresolved (evaluation happens in a layout effect on the
 * first open, so consumers can render nothing for that pre-paint frame instead
 * of flashing the wrong arm).
 */
export function useNewWorkspaceScreenVariant(
	isOpen: boolean,
): "control" | "test" | null {
	const posthog = usePostHog();
	const overrideEnabled = useFeatureFlagEnabled(
		FEATURE_FLAGS.NEW_WORKSPACE_SCREEN_OVERRIDE,
	);
	const [variant, setVariant] = useState<"control" | "test" | null>(null);

	useLayoutEffect(() => {
		if (!isOpen) return;
		if (overrideEnabled) {
			setVariant("test");
			return;
		}
		// Evaluate only after flags have loaded: getFeatureFlag before the first
		// flags response returns undefined, which would show control to a user
		// whose assignment is test — cross-arm contamination for exactly the
		// population this experiment targets (brand-new users right after
		// identify). onFeatureFlags fires immediately when flags are already
		// loaded; the timeout falls back to control (without exposure) if they
		// never arrive, so an offline user is never stuck on a blank surface.
		const evaluate = () => {
			const value = posthog.getFeatureFlag(FEATURE_FLAGS.NEW_WORKSPACE_SCREEN);
			setVariant(value === "test" ? "test" : "control");
		};
		const unsubscribe = posthog.onFeatureFlags(evaluate);
		const fallback = window.setTimeout(
			() => setVariant((current) => current ?? "control"),
			2000,
		);
		return () => {
			unsubscribe?.();
			window.clearTimeout(fallback);
		};
	}, [isOpen, overrideEnabled, posthog]);

	return variant;
}
