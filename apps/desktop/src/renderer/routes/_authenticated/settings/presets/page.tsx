import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/presets/")({
	component: PresetsRedirect,
});

// Presets have been merged into Terminal settings
function PresetsRedirect() {
	return <Navigate to="/settings/terminal" replace />;
}
