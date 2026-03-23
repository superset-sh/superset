import { useLiveQuery } from "@tanstack/react-db";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export type UserPlan = "free" | "pro" | "enterprise";

interface ResolveCurrentPlanArgs {
	subscriptionPlan?: string | null;
	sessionPlan?: string | null;
	subscriptionsLoaded: boolean;
}

function isPaidPlan(
	plan: string | null | undefined,
): plan is "pro" | "enterprise" {
	return plan === "pro" || plan === "enterprise";
}

export function resolveCurrentPlan({
	subscriptionPlan,
	sessionPlan,
	subscriptionsLoaded,
}: ResolveCurrentPlanArgs): UserPlan {
	if (isPaidPlan(subscriptionPlan)) {
		return subscriptionPlan;
	}

	if (subscriptionsLoaded) {
		return "free";
	}

	if (isPaidPlan(sessionPlan)) {
		return sessionPlan;
	}

	return "free";
}

export function useCurrentPlan(): UserPlan {
	const { data: session } = authClient.useSession();
	const collections = useCollections();

	const { data: subscriptionsData } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);

	const activeSubscription = subscriptionsData?.find(
		(subscription) => subscription.status === "active",
	);

	return resolveCurrentPlan({
		subscriptionPlan: activeSubscription?.plan,
		sessionPlan: session?.session?.plan,
		subscriptionsLoaded: subscriptionsData !== undefined,
	});
}
