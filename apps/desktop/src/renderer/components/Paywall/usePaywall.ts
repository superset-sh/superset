import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import {
	isPaidPlanTier,
	resolveCurrentPlan,
} from "renderer/hooks/useCurrentPlan";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { GatedFeature } from "./constants";
import { paywall } from "./Paywall";

export function usePaywall() {
	const { data: session } = authClient.useSession();
	const sessionPlan = session?.session?.plan;
	const utils = cloudTrpc.useUtils();

	const { data: activePlan } = cloudTrpc.billing.activePlan.useQuery(undefined);
	const isReady = activePlan !== undefined;
	// Read at the top level, not inside gateFeature: hooks may not be called
	// from a callback, and the paywall must be attributed to the org THIS
	// window is showing.
	const organizationId = useActiveOrganizationId();

	const userPlan = resolveCurrentPlan({
		subscriptionPlan: activePlan?.plan,
		sessionPlan,
		subscriptionsLoaded: isReady,
	});

	function hasAccess(feature: GatedFeature): boolean {
		void feature;
		return isPaidPlanTier(userPlan);
	}

	// The gate must never resolve on an unknown answer: fail-open leaks every
	// gated action to free users during the cold-start window, fail-closed
	// paywalls entitled trial orgs. Defer instead — ensureData awaits the
	// already-in-flight activePlan fetch, so a click during the window
	// resolves correctly a beat later. On fetch failure (offline cold start)
	// fall back to the session plan, which covers paying orgs.
	async function resolvePlanWhenKnown(): Promise<string> {
		if (isReady) return userPlan;
		try {
			const fetched = await utils.billing.activePlan.ensureData();
			return resolveCurrentPlan({
				subscriptionPlan: fetched?.plan,
				sessionPlan,
				subscriptionsLoaded: true,
			});
		} catch (error) {
			console.warn("[paywall] Failed to fetch active plan:", error);
			return resolveCurrentPlan({
				subscriptionPlan: undefined,
				sessionPlan,
				subscriptionsLoaded: false,
			});
		}
	}

	function gateFeature(
		feature: GatedFeature,
		callback: () => void | Promise<void>,
		context?: Record<string, unknown>,
	): void {
		void (async () => {
			const plan = await resolvePlanWhenKnown();
			if (isPaidPlanTier(plan)) {
				try {
					await callback();
				} catch (error) {
					console.error(`[paywall] Callback error for ${feature}:`, error);
				}
				return;
			}
			paywall(feature, {
				organizationId,
				userPlan: plan,
				...context,
			});
		})();
	}

	return {
		hasAccess,
		gateFeature,
		userPlan,
		isReady,
	};
}
