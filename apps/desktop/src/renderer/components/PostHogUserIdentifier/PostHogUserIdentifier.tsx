import { useEffect } from "react";
import { trpc } from "renderer/lib/trpc";

import { posthog } from "../../lib/posthog";

export function PostHogUserIdentifier() {
	const { data: user, isSuccess } = trpc.user.me.useQuery();

	useEffect(() => {
		if (user) {
			posthog.identify(user.id, { email: user.email, name: user.name });
		} else if (isSuccess) {
			posthog.reset();
		}
	}, [user, isSuccess]);

	return null;
}
