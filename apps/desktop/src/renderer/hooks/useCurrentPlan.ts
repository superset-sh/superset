import {
	type PlanTier,
	planTierFromSubscription,
} from "@superset/shared/billing";
import type { RouterOutputs } from "@superset/trpc";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useActiveOrganizationId } from "./useActiveOrganizationId";

type ActivePlan = RouterOutputs["billing"]["activePlan"];

/**
 * The plan of the organization THIS window shows.
 *
 * Only the billing query answers that: the window's organization header scopes
 * it server-side. The login session carries a plan too, but for the session's
 * organization, which is shared by every window and follows whichever one
 * switched last — so it is never consulted here.
 *
 * The query is keyed without the organization, so for one render after a
 * switch the cache still holds the previous organization's answer. Every read
 * checks whose plan it is holding.
 */
export function useCurrentPlan() {
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { data } = cloudTrpc.billing.activePlan.useQuery(undefined);

	const activePlan = isPlanFor(data, organizationId) ? data : undefined;
	const isReady = activePlan !== undefined;
	const plan: PlanTier = activePlan
		? planTierFromSubscription(activePlan)
		: "free";

	// The gate must never resolve on an unknown answer: fail-open leaks every
	// gated action to free users during the cold-start window, fail-closed
	// paywalls entitled trial orgs. Defer instead — ensureData awaits the
	// already-in-flight fetch, so a click during the window resolves correctly
	// a beat later. A fetch failure propagates: the caller says so rather than
	// guess.
	async function resolvePlanWhenKnown(): Promise<PlanTier> {
		if (isReady) return plan;
		const cached = await utils.billing.activePlan.ensureData();
		const fetched = isPlanFor(cached, organizationId)
			? cached
			: await utils.billing.activePlan.fetch(undefined, { staleTime: 0 });
		if (fetched.organizationId !== organizationId) {
			throw new Error(
				`Active plan answered for ${fetched.organizationId}, not ${organizationId}`,
			);
		}
		return planTierFromSubscription(fetched);
	}

	return { plan, isReady, activePlan, resolvePlanWhenKnown };
}

function isPlanFor(
	activePlan: ActivePlan | undefined,
	organizationId: string | null,
): activePlan is ActivePlan {
	return (
		activePlan !== undefined &&
		organizationId !== null &&
		activePlan.organizationId === organizationId
	);
}
