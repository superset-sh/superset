import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FreeformChatProvider } from "./providers/FreeformChatProvider";

export const Route = createFileRoute("/_authenticated/_dashboard/chat")({
	component: ChatLayout,
});

function ChatLayout() {
	return (
		<FreeformChatProvider>
			<Outlet />
		</FreeformChatProvider>
	);
}
