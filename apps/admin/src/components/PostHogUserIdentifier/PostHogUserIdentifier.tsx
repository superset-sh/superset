"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";

export function PostHogUserIdentifier() {
	const { user, isLoaded } = useUser();

	useEffect(() => {
		if (!isLoaded) return;

		if (user) {
			posthog.identify(user.id, {
				email: user.primaryEmailAddress?.emailAddress,
				name: user.fullName,
			});
		} else {
			posthog.reset();
		}
	}, [user, isLoaded]);

	return null;
}
