import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: RootIndexPage,
});

function RootIndexPage() {
	return <Navigate to="/workspace" replace />;
}
