"use client";

import { authClient } from "@superset/auth/client";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useTRPC } from "@/trpc/react";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();

	const { data: user } = useQuery({
		...trpc.user.me.queryOptions(),
		enabled: !!session?.user,
	});

	const { data: billing } = useQuery({
		...trpc.user.billingSummary.queryOptions(),
		enabled: !!session?.user,
	});

	useEffect(() => {
		if (user) {
			posthog.identify(user.id, { email: user.email, name: user.name });
		} else if (!session?.user) {
			posthog.reset();
		}
	}, [user, session?.user]);

	useEffect(() => {
		if (!user || !billing) return;
		posthog.setPersonProperties({
			is_paying: billing.isPaying,
			plan: billing.plan,
			subscription_status: billing.subscriptionStatus,
		});
	}, [user, billing]);

	return null;
}
