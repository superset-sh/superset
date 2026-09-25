"use client";

import { authClient } from "@superset/auth/client";
import posthog from "posthog-js";
import { useEffect } from "react";
import { registerBaseProperties } from "@/lib/posthog-client";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();

	useEffect(() => {
		if (session?.user) {
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
			});
		} else if (session === null) {
			// reset() drops the super properties with the person; put back the
			// ones every event needs.
			posthog.reset();
			registerBaseProperties();
		}
	}, [session]);

	return null;
}
