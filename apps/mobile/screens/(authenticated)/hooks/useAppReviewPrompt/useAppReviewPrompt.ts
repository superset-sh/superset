import * as Application from "expo-application";
import * as StoreReview from "expo-store-review";
import { usePostHog } from "posthog-react-native";
import { useCallback } from "react";
import { useAppReviewStore } from "@/screens/(authenticated)/stores/appReviewStore";

export type AppReviewMoment = "pr_merged" | "session_completed";

const SESSIONS_BEFORE_PROMPT = 3;
const PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
const SETTLE_MS = 1500;

/**
 * Asks for an App Store rating only right after Superset did something for
 * the user: they merged a pull request from their phone (qualifies at once)
 * or opened a session an agent finished for them (qualifies on the third
 * distinct one). The only UI is Apple's own sheet, which may decline to show,
 * caps itself at three a year, and honours the system-wide opt-out; on top of
 * that we never ask twice about the same version or within 90 days. The
 * prompted mark is written before the settle delay so two qualifying moments
 * in quick succession can't both schedule a request.
 */
export function useAppReviewPrompt() {
	const posthog = usePostHog();
	return useCallback(
		(moment: AppReviewMoment) => {
			if (!useAppReviewStore.persist.hasHydrated()) return;
			const now = Date.now();
			const store = useAppReviewStore.getState();
			const moments = store.recordPositiveMoment(now);
			if (moment === "session_completed" && moments < SESSIONS_BEFORE_PROMPT) {
				return;
			}
			const version = Application.nativeApplicationVersion ?? "0.0.0";
			if (store.lastPromptedVersion === version) return;
			if (
				store.lastPromptedAt !== null &&
				now - store.lastPromptedAt < PROMPT_COOLDOWN_MS
			) {
				return;
			}
			store.markPrompted(now, version);
			setTimeout(() => {
				void StoreReview.isAvailableAsync().then((available) => {
					if (!available) return;
					posthog.capture("app_review_prompt_requested", {
						moment,
						positive_moments: moments,
					});
					return StoreReview.requestReview();
				});
			}, SETTLE_MS);
		},
		[posthog],
	);
}
