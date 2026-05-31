import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingPageRedirect,
});

function OnboardingPageRedirect() {
	return <Navigate to="/v2-workspaces" replace />;
}
