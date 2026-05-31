import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/onboarding/project/")({
	component: OnboardingProjectRedirect,
});

function OnboardingProjectRedirect() {
	return <Navigate to="/v2-workspaces" replace />;
}
