import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "renderer/screens/chat";

export const Route = createFileRoute("/_authenticated/_dashboard/chat/")({
	component: ChatPage,
});

function ChatPage() {
	// For now, use a hardcoded session ID
	// In the full implementation, this would come from route params or state
	const sessionId = "demo-session";

	return (
		<div className="h-full">
			<ChatView sessionId={sessionId} />
		</div>
	);
}
