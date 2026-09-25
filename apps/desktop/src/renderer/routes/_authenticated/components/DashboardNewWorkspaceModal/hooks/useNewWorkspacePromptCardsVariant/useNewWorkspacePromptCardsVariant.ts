import { FEATURE_FLAGS } from "@superset/shared/constants";
import { usePostHog } from "posthog-js/react";
import { useLayoutEffect, useState } from "react";

/**
 * Arms of the new-workspace prompt form-factor experiment:
 * - `control`  three inline prompt rows (what ships today)
 * - `cards2`   two cards above the composer
 * - `cards4`   four cards in a 2x2 grid
 *
 * The prompt sets are nested prefixes of one fixed pool, so the only thing
 * that varies is form factor. `cards2` vs `cards4` is the decision-paralysis
 * question — read it as "do the extra two prompts earn their slot", since
 * count and the marginal prompts' quality move together.
 */
export type PromptCardsVariant = "control" | "cards2" | "cards4";

/**
 * Assigns the prompt-cards arm. Same imperative `getFeatureFlag` shape as
 * `useNewWorkspaceScreenVariant`: exposure fires only once the screen is
 * actually open, and only after flags have loaded — reading the flag earlier
 * returns undefined, which would show control to a test user.
 *
 * Both flags are read inside the loaded callback rather than through
 * `useFeatureFlagEnabled`: that hook returns undefined until its own passive
 * effect sees the flags, which lands after this layout effect has already run
 * `getFeatureFlag` and burned an exposure on an overridden user.
 *
 * The override short-circuits everything, so team and dev accounts can see the
 * cards without entering the analysis.
 *
 * Returns null until resolved so the caller can render neither arm for that
 * first frame instead of flashing the rows and swapping to cards.
 */
export function useNewWorkspacePromptCardsVariant(
	isOpen: boolean,
): PromptCardsVariant | null {
	const posthog = usePostHog();
	const [variant, setVariant] = useState<PromptCardsVariant | null>(null);

	useLayoutEffect(() => {
		if (!isOpen) return;
		const evaluate = () => {
			if (
				posthog.isFeatureEnabled(
					FEATURE_FLAGS.NEW_WORKSPACE_PROMPT_CARDS_OVERRIDE,
				)
			) {
				setVariant("cards2");
				return;
			}
			const value = posthog.getFeatureFlag(
				FEATURE_FLAGS.NEW_WORKSPACE_PROMPT_CARDS,
			);
			setVariant(value === "cards2" || value === "cards4" ? value : "control");
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
	}, [isOpen, posthog]);

	return variant;
}
