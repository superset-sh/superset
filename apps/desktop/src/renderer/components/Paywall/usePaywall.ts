import { authClient } from "renderer/lib/auth-client";
import { paywall } from "./Paywall";

type UserPlan = "free" | "pro";

// Feature identifiers - use these constants to avoid typos and get autocomplete
export const GATED_FEATURES = {
	INVITE_MEMBERS: "invite-members",
	AI_COMPLETION: "ai-completion",
	SPLIT_TERMINAL: "split-terminal",
	CREATE_WORKSPACE: "create-workspace",
} as const;

export type GatedFeature = (typeof GATED_FEATURES)[keyof typeof GATED_FEATURES];

/**
 * Hook for managing feature access and paywall.
 *
 * Usage:
 * ```tsx
 * import { usePaywall, GATED_FEATURES } from 'renderer/components/Paywall';
 *
 * const { hasAccess, gateFeature } = usePaywall();
 *
 * // Guard a sync action
 * <Button onClick={() => gateFeature(GATED_FEATURES.INVITE_MEMBERS, () => {
 *   openInviteDialog();
 * })}>
 *   Invite Team Member
 * </Button>
 *
 * // Guard an async action
 * <Button onClick={() => gateFeature(GATED_FEATURES.CREATE_WORKSPACE, async () => {
 *   await createWorkspace(data);
 * })}>
 *   Create Workspace
 * </Button>
 *
 * // Conditional rendering
 * {hasAccess(GATED_FEATURES.INVITE_MEMBERS) && <InviteButton />}
 * ```
 */
export function usePaywall() {
	const { data: session } = authClient.useSession();

	// TODO: Once Stripe integration is done, use: session?.user?.plan
	// For now, mock as 'free' to test paywall
	void session;
	const userPlan: UserPlan = "free"; // Replace with: (session?.user?.plan as UserPlan) || "free";

	/**
	 * Check if user has access to a feature.
	 * @param feature - Feature identifier from GATED_FEATURES
	 */
	function hasAccess(feature: GatedFeature): boolean {
		// For now, all features require 'pro' plan
		// Later: add feature -> required plan mapping using the feature param
		void feature;
		return userPlan === "pro";
	}

	/**
	 * Gate a feature - only execute callback if user has access.
	 * Shows paywall dialog if user doesn't have access.
	 * Supports both sync and async callbacks.
	 *
	 * @param feature - Feature identifier from GATED_FEATURES
	 * @param callback - Function to execute if user has access (can be async)
	 */
	function gateFeature(
		feature: GatedFeature,
		callback: () => void | Promise<void>,
	): void {
		if (hasAccess(feature)) {
			// Execute callback - handle both sync and async
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
