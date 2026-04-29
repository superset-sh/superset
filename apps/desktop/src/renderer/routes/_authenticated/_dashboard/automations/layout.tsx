import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";

export const Route = createFileRoute("/_authenticated/_dashboard/automations")({
	component: AutomationsLayout,
});

function AutomationsLayout() {
	const navigate = useNavigate();
	const { hasAccess, gateFeature } = usePaywall();
	const allowed = hasAccess(GATED_FEATURES.AUTOMATIONS);

	useEffect(() => {
		if (allowed) return;
		gateFeature(GATED_FEATURES.AUTOMATIONS, () => {});
		navigate({ to: "/v2-workspaces" });
	}, [allowed, gateFeature, navigate]);

	if (!allowed) return null;
	return <Outlet />;
}
