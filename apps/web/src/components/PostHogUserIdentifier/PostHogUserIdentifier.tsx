"use client";

import { authClient } from "@superset/auth/client";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useTRPC } from "@/trpc/react";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();

	const { data: billing } = useQuery({
		...trpc.user.billingSummary.queryOptions(),
		enabled: !!session?.user,
	});

	useEffect(() => {
		if (session?.user) {
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
			});
		} else if (session === null) {
			posthog.reset();
		}
	}, [session]);

	useEffect(() => {
		if (!session?.user || !billing) return;
		posthog.setPersonProperties({
			is_paying: billing.isPaying,
			plan: billing.plan,
			subscription_status: billing.subscriptionStatus,
		});
	}, [session?.user, billing]);

	return null;
}
