import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/chat")({
	component: ChatLayout,
});

function ChatLayout() {
	return <Outlet />;
}
