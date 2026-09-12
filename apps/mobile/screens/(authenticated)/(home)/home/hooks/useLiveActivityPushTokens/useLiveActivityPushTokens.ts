import { useLingui } from "@lingui/react/macro";
import LiveActivity from "@superset/live-activity";
import * as Application from "expo-application";
import { useEffect } from "react";
import { apiClient } from "@/lib/trpc/client";

/**
 * Hands the Lock Screen card's APNs tokens to the API so it can rewrite the
 * card while the app is closed, together with the status words in this
 * phone's language: the API never translates, and the widget only renders.
 */
export function useLiveActivityPushTokens({
	enabled = true,
}: {
	enabled?: boolean;
} = {}): void {
	const { t } = useLingui();

	useEffect(() => {
		if (!enabled) return;
		if (!LiveActivity.areActivitiesEnabled()) return;

		// Reuses the catalog entry the card already has for "+3 more"; the
		// API substitutes the count into the placeholder.
		const hidden = "{n}";
		const labels = {
			working: t({ message: "Working", context: "agent status" }),
			review: t({ message: "Review", context: "agent status" }),
			permission: t({ message: "Needs you", context: "agent status" }),
			failed: t({ message: "Failed", context: "agent status" }),
			more: t`+${hidden} more`,
		};

		let deviceId: string | null = null;
		let cancelled = false;

		const register = (
			kind: "update" | "push_to_start",
			token: string,
			activityId?: string,
		) => {
			if (!deviceId) return;
			apiClient.mobile.liveActivity.registerToken
				.mutate({
					kind,
					deviceId,
					token,
					...(activityId ? { activityId } : {}),
					labels,
				})
				.catch(() => {
					// The next transition or launch registers again; nothing to
					// tell the user meanwhile.
				});
		};
		const release = (token: string | undefined) => {
			if (!token) return;
			apiClient.mobile.liveActivity.releaseToken
				.mutate({ token })
				.catch(() => {});
		};

		const subscriptions = [
			LiveActivity.addListener("onPushToken", ({ activityId, token }) =>
				register("update", token, activityId),
			),
			LiveActivity.addListener("onPushToStartToken", ({ token }) =>
				register("push_to_start", token),
			),
			LiveActivity.addListener("onActivityEnded", ({ token }) =>
				release(token),
			),
		];

		// The device id tells the API which phone a token belongs to, so two
		// phones on one account each get the push that fits their state.
		void Application.getIosIdForVendorAsync().then((id) => {
			if (cancelled || !id) return;
			deviceId = id;
			// Tokens issued before this effect ran (a relaunch, a locale change
			// remounting it) never fire the events again.
			const pushToStart = LiveActivity.pushToStartToken();
			if (pushToStart) register("push_to_start", pushToStart);
			for (const [activityId, token] of Object.entries(
				LiveActivity.activityTokens(),
			)) {
				register("update", token, activityId);
			}
		});

		return () => {
			cancelled = true;
			for (const subscription of subscriptions) subscription.remove();
		};
	}, [enabled, t]);
}
