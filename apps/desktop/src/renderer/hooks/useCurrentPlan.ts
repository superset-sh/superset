import { type PlanTier, resolveCurrentPlan } from "@superset/shared/billing";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

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
