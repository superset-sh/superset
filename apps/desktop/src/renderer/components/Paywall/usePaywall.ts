import { authClient } from "renderer/lib/auth-client";
import { paywall } from "./Paywall";

type UserPlan = "free" | "pro";

export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	INTEGRATIONS: "integrations",
	TASKS: "tasks",
	CLOUD_WORKSPACES: "cloud-workspaces",
	MOBILE_APP: "mobile-app",
} as const;

export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

export function usePaywall() {
	const { data: session } = authClient.useSession();

	const userPlan: UserPlan = (session?.session?.plan as UserPlan) ?? "free";

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
