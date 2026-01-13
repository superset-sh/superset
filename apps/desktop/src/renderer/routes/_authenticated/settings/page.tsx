import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	// Redirect to account settings by default
	return <Navigate to="/settings/account" replace />;
}
