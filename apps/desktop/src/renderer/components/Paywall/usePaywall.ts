import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { authClient } from "renderer/lib/auth-client";
import type { GatedFeature } from "./constants";
import { paywall } from "./Paywall";

export function usePaywall() {
	const { data: session } = authClient.useSession();
	const { plan: userPlan, isReady } = useCurrentPlan();

	function hasAccess(feature: GatedFeature): boolean {
		void feature;
		return userPlan === "pro" || userPlan === "enterprise";
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
		isReady,
	};
}
