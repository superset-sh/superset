import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { PlansComparison } from "../components/PlansComparison";

export const Route = createFileRoute("/_authenticated/settings/billing/plans/")(
	{
		component: PlansPage,
	},
);

function PlansPage() {
	const billingEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.BILLING_ENABLED);

	if (billingEnabled === undefined) {
		return null;
	}

	if (billingEnabled === false) {
		return <Navigate to="/settings/account" />;
	}

	return <PlansComparison />;
}
