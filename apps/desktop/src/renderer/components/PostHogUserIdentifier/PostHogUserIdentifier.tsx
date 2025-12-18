import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";

import { posthog } from "../../lib/posthog";

export function PostHogUserIdentifier() {
	const { data: user, isLoading } = trpc.user.me.useQuery();

	useEffect(() => {
		if (isLoading) return;

		if (user) {
			posthog.identify(user.id, {
				email: user.email,
				name: user.name,
			});
		} else {
			posthog.reset();
		}
	}, [user, isLoading]);

	return null;
}
