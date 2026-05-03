import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export function PostHogUserIdentifier() {
	const { data: session } = useSession();
	const posthog = usePostHog();
	const userId = session?.user.id;

	useEffect(() => {
		if (session?.user) {
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
			});
		} else if (session === null) {
			posthog.reset();
		}
	}, [session, posthog]);

	useEffect(() => {
		if (!userId) return;
		let cancelled = false;
		apiClient.user.billingSummary
			.query()
			.then((billing) => {
				if (cancelled) return;
				posthog.identify(userId, {
					is_paying: billing.isPaying,
					plan: billing.plan,
					subscription_status: billing.subscriptionStatus,
				});
			})
			.catch((error) => {
				console.error("[PostHogUserIdentifier] billingSummary failed", error);
			});
		return () => {
			cancelled = true;
		};
	}, [userId, posthog]);

	return null;
}
