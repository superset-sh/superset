"use client";

import { authClient } from "@superset/auth/client";
import posthog from "posthog-js";
import { useEffect } from "react";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();

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

	return null;
}
