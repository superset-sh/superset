import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useLastVisitedSettingsPath } from "renderer/stores/settings-state";

export const Route = createFileRoute("/_authenticated/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	const lastVisited = useLastVisitedSettingsPath();
	const navigate = useNavigate();
	const target =
		lastVisited?.startsWith("/settings/") && lastVisited !== "/settings/"
			? lastVisited
			: "/settings/account";

	useEffect(() => {
		navigate({ to: target, replace: true });
	}, [navigate, target]);

	return null;
}
