import { authClient } from "renderer/lib/auth-client";
import { paywall } from "./Paywall";

type UserPlan = "free" | "pro";

export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	AI_COMPLETION: "ai-completion",
	SPLIT_TERMINAL: "split-terminal",
	CREATE_WORKSPACE: "create-workspace",
} as const;

export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

export function usePaywall() {
	const { data: session } = authClient.useSession();

	void session;
	const userPlan: UserPlan = "free";

	function hasAccess(feature: GatedFeature): boolean {
		void feature;
		return userPlan === "pro";
	}

	function gateFeature(
		feature: GatedFeature,
		callback: () => void | Promise<void>,
	): void {
		if (hasAccess(feature)) {
			const result = callback();
			if (result instanceof Promise) {
				result.catch((error) => {
					console.error(`[paywall] Callback error for ${feature}:`, error);
				});
			}
		} else {
			console.log(`[paywall] User blocked from feature: ${feature}`);
			paywall(feature);
		}
	}

	return {
		hasAccess,
		gateFeature,
		userPlan,
	};
}
