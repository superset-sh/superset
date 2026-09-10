import { FEATURE_FLAGS } from "@superset/shared/constants";
import { userError } from "../../i18n-error";
import { posthog } from "../analytics";

/**
 * Gate every cloud-sandbox procedure — workspaces, environments, secrets — on
 * the flag the clients already hide the Cloud option behind, so the allowlist
 * lives in its release conditions rather than the repository.
 *
 * Not `cloud-access`, despite the name: that one resolves to a broad cohort of
 * mostly external accounts, and sandboxes bill by the hour with no idle-stop.
 *
 * Fails closed — `isFeatureEnabled` resolves undefined when PostHog is
 * unreachable, so an outage suspends cloud access rather than opening it.
 */
export async function assertCloudAccess(user: {
	userId: string;
	email: string;
}): Promise<void> {
	const account = user.email.trim().toLowerCase();
	const enabled = await posthog.isFeatureEnabled(
		FEATURE_FLAGS.CLOUD_WORKSPACES,
		user.userId,
		{
			// Sent explicitly: the conditions are email-based, and a person
			// PostHog has not seen yet would otherwise be refused for the wrong
			// reason. No exposure events — this is authorization, not an experiment.
			personProperties: { email: account },
			sendFeatureFlagEvents: false,
		},
	);
	if (enabled) return;

	throw userError({
		code: "FORBIDDEN",
		message: `Cloud sandboxes are limited to the Superset team while the feature is in internal testing, and ${account || "this account"} is not on the list.`,
		i18nKey: "serverError.cloudWorkspace.cloudSandboxesAreInternalOnly",
		params: { account: account || "this account" },
	});
}

export function assertMember(
	organizationIds: string[],
	organizationId: string,
): void {
	if (!organizationIds.includes(organizationId)) {
		throw userError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
			i18nKey: "serverError.cloudWorkspace.notAMemberOfThisOrganization",
		});
	}
}
