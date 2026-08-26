import { auth } from "@superset/auth/server";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { headers } from "next/headers";
import { cache } from "react";

import { posthogServer } from "@/lib/posthog-server";

export const getPagesAccess = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		return { hasPagesAccess: false, session: null };
	}

	let hasPagesAccess = false;

	try {
		const flag = await posthogServer.getFeatureFlag(
			FEATURE_FLAGS.PAGES,
			session.user.id,
			{ personProperties: { email: session.user.email } },
		);
		hasPagesAccess = Boolean(flag);
	} catch (error) {
		console.error("[pages] Failed to load the pages feature flag", error);
	}

	return { hasPagesAccess, session };
});
