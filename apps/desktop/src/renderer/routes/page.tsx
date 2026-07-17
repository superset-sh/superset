import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: RootIndexPage,
});

// Hoisted for stable props identity — <Navigate> re-navigates every re-render otherwise (react error #185 loop, #5729)
const workspaceRedirect = <Navigate to="/workspace" replace />;

function RootIndexPage() {
	return workspaceRedirect;
}
