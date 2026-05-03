"use client";

import { authClient } from "@superset/auth/client";
import posthog from "posthog-js";
import { useEffect } from "react";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();
	const plan = session?.session?.plan ?? null;

	useEffect(() => {
		if (session?.user) {
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
				plan,
				is_paying: plan != null && plan !== "free",
			});
		} else if (session === null) {
			posthog.reset();
		}
	}, [session, plan]);

	return null;
}
