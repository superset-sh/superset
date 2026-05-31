import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingRedirect,
});

function OnboardingRedirect() {
	return <Navigate to="/v2-workspaces" replace />;
}
