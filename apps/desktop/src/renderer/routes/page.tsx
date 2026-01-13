import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	console.log("[Router] Index page loaded, redirecting to /workspace");
	// Redirect to workspace by default
	return <Navigate to="/workspace" replace />;
}
