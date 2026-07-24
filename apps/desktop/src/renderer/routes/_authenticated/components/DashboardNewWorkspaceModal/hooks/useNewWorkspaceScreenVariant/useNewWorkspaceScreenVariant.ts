import {
	FEATURE_FLAGS,
	NEW_WORKSPACE_SCREEN_EXPERIMENT_START,
} from "@superset/shared/constants";
import { useFeatureFlagEnabled, usePostHog } from "posthog-js/react";
import { useLayoutEffect, useState } from "react";
import { authClient } from "renderer/lib/auth-client";

function isEligible(createdAt: Date | string | null | undefined): boolean {
	if (createdAt == null) return false;
	const created =
		createdAt instanceof Date
			? createdAt.getTime()
			: new Date(createdAt).getTime();
	if (Number.isNaN(created)) return false;
	return created >= new Date(NEW_WORKSPACE_SCREEN_EXPERIMENT_START).getTime();
}

/**
 * Assigns the new-workspace-screen experiment arm. Calls `getFeatureFlag`
 * imperatively (not `useFeatureFlagVariantKey`) so the `$feature_flag_called`
 * exposure event fires only when an eligible user actually reaches the
 * new-workspace surface — never on app load or for pre-cutoff accounts.
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
	const { data: session } = authClient.useSession();
	const eligible = isEligible(session?.user?.createdAt);
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
		if (!eligible) {
			setVariant("control");
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
	}, [isOpen, eligible, overrideEnabled, posthog]);

	return variant;
}
