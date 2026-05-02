import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";

export const Route = createFileRoute("/_authenticated/_dashboard/automations")({
	component: AutomationsLayout,
});

function AutomationsLayout() {
	const navigate = useNavigate();
	const { hasAccess, gateFeature, isReady } = usePaywall();
	const allowed = hasAccess(GATED_FEATURES.AUTOMATIONS);
	const handledRef = useRef(false);

	useEffect(() => {
		if (!isReady || allowed || handledRef.current) return;
		handledRef.current = true;
		gateFeature(GATED_FEATURES.AUTOMATIONS, () => {});
		navigate({ to: "/v2-workspaces", replace: true });
	}, [isReady, allowed, gateFeature, navigate]);

	if (!isReady || !allowed) return null;
	return <Outlet />;
}
