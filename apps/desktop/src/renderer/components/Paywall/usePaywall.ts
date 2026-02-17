import { useLiveQuery } from "@tanstack/react-db";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { GatedFeature } from "./constants";
import { paywall } from "./Paywall";

type UserPlan = "free" | "pro";

export function usePaywall() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const subscriptions = collections.subscriptions;

	const { data: subscriptionsData } = useLiveQuery(
		(q) => q.from({ subscriptions }),
		[subscriptions],
	);
	const activeSubscription = subscriptionsData?.find(
		(s) => s.status === "active",
	);
	const rawPlan = activeSubscription?.plan;
	const userPlan: UserPlan = rawPlan === "pro" ? "pro" : "free";

	function hasAccess(feature: GatedFeature): boolean {
		void feature;
		return userPlan === "pro";
	}

	function gateFeature(
		feature: GatedFeature,
		callback: () => void | Promise<void>,
		context?: Record<string, unknown>,
	): void {
		if (hasAccess(feature)) {
			const result = callback();
			if (result instanceof Promise) {
				result.catch((error) => {
					console.error(`[paywall] Callback error for ${feature}:`, error);
				});
			}
		} else {
			const trackingContext = {
				organizationId: session?.session?.activeOrganizationId,
				userPlan,
				...context,
			};
			paywall(feature, trackingContext);
		}
	}

	return {
		hasAccess,
		gateFeature,
		userPlan,
	};
}
