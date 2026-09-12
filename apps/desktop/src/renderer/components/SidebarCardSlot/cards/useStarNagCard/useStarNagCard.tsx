import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useReducer } from "react";
import { AnimatedStarButton } from "renderer/components/AnimatedStarButton";
import {
	canActivateStarAction,
	useGithubStarAction,
	useJustStarredWindow,
} from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";
import { useStarNagStore } from "renderer/stores/star-nag";
import type { SidebarCardEntry } from "../../types";

/**
 * Offers a GitHub star once the user has created enough workspaces to have
 * proven they're getting real use out of the app.
 */
export function useStarNagCard({
	isCollapsed,
}: {
	isCollapsed?: boolean;
}): SidebarCardEntry | null {
	const { t } = useLingui();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.STAR_NAG_CARD);
	const shouldShow = useStarNagStore((s) => s.shouldShowThresholdCard());
	const deferredUntil = useStarNagStore((s) => s.deferredUntil);
	const dismiss = useStarNagStore((s) => s.dismiss);

	// Gated on collapse/flag rather than on winning the slot: StarNagObserver's
	// own always-on query already covers the pill/toast/settings row, so this
	// only avoids a second redundant observer, never a missed read.
	const { state, activate, isBusy } = useGithubStarAction({
		enabled: !isCollapsed && isEnabled === true,
	});

	// shouldShowThresholdCard() is only re-evaluated when the store itself
	// changes — a cooldown expiring is a pure passage of time, not a store
	// write, so without this the card stays hidden past its cooldown until
	// something unrelated happens to write to the store.
	const [, forceRecheck] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		if (!deferredUntil) return;
		const msUntilExpiry = deferredUntil - Date.now();
		if (msUntilExpiry <= 0) return;
		const timer = setTimeout(forceRecheck, msUntilExpiry);
		return () => clearTimeout(timer);
	}, [deferredUntil]);

	// Starring calls markCompleted() internally, which flips shouldShow to
	// false immediately — without this, the card would unmount before the
	// AnimatedStarButton's confetti/label animation gets a chance to play.
	const celebrating = useJustStarredWindow(state);

	if (isCollapsed || !isEnabled || !(shouldShow || celebrating)) return null;

	// A "loading" or "unknown" read isn't trustworthy enough to act on, so the
	// button doesn't render for those — the card chrome (title, description,
	// dismiss) stays up regardless, same pattern as StarNagToast.
	const canStar = canActivateStarAction(state);
	const showButton = canStar || celebrating;

	return {
		id: "star-nag",
		title: t({
			message: "Enjoying Superset?",
		}),
		description: t({
			message:
				"Superset is open source. If it's helped you today, a GitHub star helps other developers find it.",
		}),
		onDismiss: () => {
			track("star_nag_dismissed", { surface: "card" });
			dismiss();
		},
		children: showButton ? (
			<AnimatedStarButton
				state={state}
				busy={isBusy}
				onActivate={() => {
					// A click during the post-star celebration window reaches this
					// handler but activate() no-ops for it — don't record a "starred"
					// event for a click that didn't actually do anything.
					if (canActivateStarAction(state)) {
						track("star_nag_starred", { surface: "card" });
					}
					activate();
				}}
				className="mt-3 w-full justify-center"
			/>
		) : undefined,
		// An impression of the star ask means the button was actually on screen,
		// which can start false and flip true while the card stays put.
		shownKey: canStar ? "star-nag:asking" : "star-nag:no-button",
		onShown: () => {
			if (canStar) track("star_nag_shown", { surface: "card" });
		},
	};
}
