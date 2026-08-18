import { createFileRoute } from "@tanstack/react-router";
import { Redirect } from "renderer/components/Redirect";

export const Route = createFileRoute("/")({
	component: RootIndexPage,
});

function RootIndexPage() {
	return <Redirect to="/workspace" replace />;
}
