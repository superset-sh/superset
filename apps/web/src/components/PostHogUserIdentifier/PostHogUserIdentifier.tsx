"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";

export function PostHogUserIdentifier() {
	const { userId } = useAuth();
	const { user } = useUser();

	useEffect(() => {
		if (user) {
			posthog.identify(user.id, {
				email: user.primaryEmailAddress?.emailAddress,
				name: user.fullName,
				user_id: user.id,
			});
		} else if (!userId) {
			posthog.reset();
		}
	}, [user, userId]);

	return null;
}
