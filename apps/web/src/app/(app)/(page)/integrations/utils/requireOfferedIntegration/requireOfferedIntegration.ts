import { auth } from "@superset/auth/server";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	type IntegrationProvider,
	isIntegrationOffered,
} from "@superset/shared/integrations";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { posthogServer } from "@/lib/posthog-server";

const getTriggerFlagPayload = cache(async (): Promise<unknown> => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session?.user) return undefined;

	try {
		return await posthogServer.getFeatureFlagPayload(
			FEATURE_FLAGS.AUTOMATION_EVENT_TRIGGERS,
			session.user.id,
			undefined,
			{ personProperties: { email: session.user.email } },
		);
	} catch (error) {
		console.error(
			"[integrations] Failed to load the automation-event-triggers flag",
			error,
		);
		return undefined;
	}
});

/**
 * 404s a provider page the caller isn't offered. The index never links to
 * it, and a page the flag hides shouldn't be one URL away; a failed flag
 * lookup reads as not offered, the same as everywhere else the flag is read.
 */
export async function requireOfferedIntegration(
	provider: IntegrationProvider,
): Promise<void> {
	if (!isIntegrationOffered(provider, await getTriggerFlagPayload())) {
		notFound();
	}
}
