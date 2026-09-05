import { FEATURE_FLAGS } from "@superset/shared/constants";
import { cache } from "react";

import { posthogServer } from "@/lib/posthog-server";
import { requireSession } from "../../../utils/requireSession";

export const getAgentsUiAccess = cache(async () => {
	const session = await requireSession();

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
