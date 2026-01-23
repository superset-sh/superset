import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { BillingOverview } from "./components/BillingOverview";

export const Route = createFileRoute("/_authenticated/settings/billing/")({
	component: BillingPage,
});

function BillingPage() {
	const searchQuery = useSettingsSearchQuery();
	const billingEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.BILLING_ENABLED);

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "billing").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	if (billingEnabled === undefined) {
		return null;
	}

	if (billingEnabled === false) {
		return <Navigate to="/settings/account" />;
	}

	return <BillingOverview visibleItems={visibleItems} />;
}
