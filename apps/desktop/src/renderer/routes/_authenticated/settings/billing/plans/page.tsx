import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { PlansComparison } from "../components/PlansComparison";

export const Route = createFileRoute("/_authenticated/settings/billing/plans/")(
	{
		component: PlansPage,
	},
);

function PlansPage() {
	const billingEnabled = useFeatureFlagEnabled("billing-enabled");

	if (!billingEnabled) {
		return <Navigate to="/settings/account" />;
	}

	return <PlansComparison />;
}
