import type { PlanTier } from "@superset/shared/billing";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface ResolveCurrentPlanArgs {
	subscriptionPlan?: string | null;
	sessionPlan?: string | null;
	subscriptionsLoaded: boolean;
}

export function isPaidPlanTier(
	plan: string | null | undefined,
): plan is "pro" | "enterprise" {
	return plan === "pro" || plan === "enterprise";
}

export function resolveCurrentPlan({
	subscriptionPlan,
	sessionPlan,
	subscriptionsLoaded,
}: ResolveCurrentPlanArgs): PlanTier {
	if (isPaidPlanTier(subscriptionPlan)) {
		return subscriptionPlan;
	}

	if (subscriptionsLoaded) {
		return "free";
	}

	if (isPaidPlanTier(sessionPlan)) {
		return sessionPlan;
	}

	return "free";
}

export function useCurrentPlan(): { plan: PlanTier; isReady: boolean } {
	const { data: session } = authClient.useSession();

	const { data: activePlan } = cloudTrpc.billing.activePlan.useQuery(undefined);

	const subscriptionsLoaded = activePlan !== undefined;

	const plan = resolveCurrentPlan({
		subscriptionPlan: activePlan?.plan,
		sessionPlan: session?.session?.plan,
		subscriptionsLoaded,
	});

	return { plan, isReady: subscriptionsLoaded };
}
