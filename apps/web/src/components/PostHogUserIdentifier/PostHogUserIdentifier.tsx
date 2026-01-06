"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useTRPC } from "../../trpc/react";

export function PostHogUserIdentifier() {
	const { isSignedIn } = useUser();
	const trpc = useTRPC();

	const { data: user } = useQuery({
		...trpc.user.me.queryOptions(),
		enabled: isSignedIn,
	});

	useEffect(() => {
		if (user) {
			posthog.identify(user.id, { email: user.email, name: user.name });
		} else if (isSignedIn === false) {
			posthog.reset();
		}
	}, [user, isSignedIn]);

	return null;
}
