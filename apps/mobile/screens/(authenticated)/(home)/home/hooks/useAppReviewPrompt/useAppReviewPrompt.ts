import * as Application from "expo-application";
import { useFocusEffect } from "expo-router";
import * as StoreReview from "expo-store-review";
import { usePostHog } from "posthog-react-native";
import { useCallback } from "react";
import { useAppReviewStore } from "@/screens/(authenticated)/stores/appReviewStore";

const MESSAGES_BEFORE_PROMPT = 5;
const WORKSPACES_BEFORE_PROMPT = 2;
const PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
const SETTLE_MS = 1500;

/**
 * Asks for an App Store rating when the user comes back to Home after doing
 * something on their phone, once they have sent enough messages or created
 * enough workspaces to have formed an opinion. The only UI is Apple's own
 * sheet, which may decline to show, caps itself at three a year, and honours
 * the system-wide opt-out; on top of that we never ask twice about the same
 * version or within 90 days.
 */
export function useAppReviewPrompt() {
	const posthog = usePostHog();
	useFocusEffect(
		useCallback(() => {
			if (!useAppReviewStore.persist.hasHydrated()) return;
			const store = useAppReviewStore.getState();
			if (!store.actedSinceHome) return;
			store.clearActedSinceHome();
			if (
				store.messagesSent < MESSAGES_BEFORE_PROMPT &&
				store.workspacesCreated < WORKSPACES_BEFORE_PROMPT
			) {
				return;
			}
			const version = Application.nativeApplicationVersion ?? "0.0.0";
			if (store.lastPromptedVersion === version) return;
			const now = Date.now();
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
						messages_sent: store.messagesSent,
						workspaces_created: store.workspacesCreated,
					});
					return StoreReview.requestReview();
				});
			}, SETTLE_MS);
		}, [posthog]),
	);
}
