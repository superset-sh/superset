import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled, usePostHog } from "posthog-js/react";
import { useLayoutEffect, useState } from "react";

/**
 * Assigns the prompt-cards arm for the new-workspace screen. Same imperative
 * `getFeatureFlag` shape as `useNewWorkspaceScreenVariant`: exposure fires only
 * once the screen is actually open, and only after flags have loaded — reading
 * the flag earlier returns undefined and would show control to a test user.
 *
 * The override flag short-circuits everything: it forces the cards without ever
 * evaluating the experiment flag, so overridden users (team, dev accounts) emit
 * no exposure and cannot contaminate results.
 *
 * Returns null until resolved so the caller can render neither arm for that
 * first frame instead of flashing the rows and swapping to cards.
 */
export function useNewWorkspacePromptCardsVariant(
	isOpen: boolean,
): "control" | "test" | null {
	const posthog = usePostHog();
	const overrideEnabled = useFeatureFlagEnabled(
		FEATURE_FLAGS.NEW_WORKSPACE_PROMPT_CARDS_OVERRIDE,
	);
	const [variant, setVariant] = useState<"control" | "test" | null>(null);

	useLayoutEffect(() => {
		if (!isOpen) return;
		if (overrideEnabled) {
			setVariant("test");
			return;
		}
		const evaluate = () => {
			const value = posthog.getFeatureFlag(
				FEATURE_FLAGS.NEW_WORKSPACE_PROMPT_CARDS,
			);
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
