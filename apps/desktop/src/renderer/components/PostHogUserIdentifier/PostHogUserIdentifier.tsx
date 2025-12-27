import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";

import { posthog } from "../../lib/posthog";

const AUTH_COMPLETED_KEY = "superset_auth_completed";

export function PostHogUserIdentifier() {
	const { data: user, isSuccess } = trpc.user.me.useQuery();
	const { mutate: setUserId } = trpc.analytics.setUserId.useMutation();

	useEffect(() => {
		if (user) {
			posthog.identify(user.id, { email: user.email, name: user.name });
			setUserId({ userId: user.id });

			const trackedUserId = localStorage.getItem(AUTH_COMPLETED_KEY);
			if (trackedUserId !== user.id) {
				posthog.capture("auth_completed");
				localStorage.setItem(AUTH_COMPLETED_KEY, user.id);
			}
		} else if (isSuccess) {
			posthog.reset();
			setUserId({ userId: null });
			localStorage.removeItem(AUTH_COMPLETED_KEY);
		}
	}, [user, isSuccess, setUserId]);

	return null;
}
