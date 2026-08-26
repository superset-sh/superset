import { auth } from "@superset/auth/server";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { posthogServer } from "@/lib/posthog-server";

export const getAgentsUiAccess = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		redirect("/sign-in");
	}

	let hasAgentsUiAccess = false;

	try {
		hasAgentsUiAccess = Boolean(
			await posthogServer.getFeatureFlag(
				FEATURE_FLAGS.WEB_AGENTS_UI_ACCESS,
				session.user.id,
			),
		);
	} catch (error) {
		console.error(
			"[getAgentsUiAccess] Failed to load the agents UI feature flag",
			error,
		);
	}

	return {
		hasAgentsUiAccess,
		session,
	};
});
