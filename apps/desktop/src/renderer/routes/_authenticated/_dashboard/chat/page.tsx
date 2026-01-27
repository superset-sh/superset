import { createStream } from "@superset/ai-chat/stream";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useChatStore } from "renderer/stores/chatStore";

const STREAM_SERVER_URL = "http://localhost:8080";

export const Route = createFileRoute("/_authenticated/_dashboard/chat/")({
	component: ChatIndexPage,
});

function ChatIndexPage() {
	const navigate = useNavigate();
	const { sessions, createSession } = useChatStore();

	const handleCreateChat = useCallback(async () => {
		const session = createSession();
		// Create stream on server
		await createStream(STREAM_SERVER_URL, session.id);
		// Navigate to the new chat
		navigate({ to: "/chat/$chatId", params: { chatId: session.id } });
	}, [navigate, createSession]);

	const handleSelectChat = useCallback(
		async (chatId: string) => {
			// Ensure stream exists
			await createStream(STREAM_SERVER_URL, chatId);
			navigate({ to: "/chat/$chatId", params: { chatId } });
		},
		[navigate],
	);

	return (
		<div className="flex h-full">
			{/* Sidebar */}
			<div className="w-64 border-r border-border flex flex-col bg-muted/30">
				<div className="p-3 border-b border-border">
					<Button onClick={handleCreateChat} className="w-full" size="sm">
						+ New Chat
					</Button>
				</div>

				<ScrollArea className="flex-1">
					<div className="p-2 space-y-1">
						{sessions.length === 0 ? (
							<div className="text-center text-muted-foreground text-sm py-8 px-4">
								No chats yet.
								<br />
								Click "+ New Chat" to start.
							</div>
						) : (
							sessions.map((session) => (
								<button
									key={session.id}
									type="button"
									onClick={() => handleSelectChat(session.id)}
									className={cn(
										"w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
										"hover:bg-accent hover:text-accent-foreground",
									)}
								>
									<span className="truncate block">{session.name}</span>
									<span className="text-xs text-muted-foreground">
										{new Date(session.createdAt).toLocaleDateString()}
									</span>
								</button>
							))
						)}
					</div>
				</ScrollArea>
			</div>

			{/* Main area - empty state */}
			<div className="flex-1 flex items-center justify-center text-muted-foreground">
				<div className="text-center">
					<p className="text-4xl mb-4 opacity-50">💬</p>
					<p>Select a chat or create a new one</p>
				</div>
			</div>
		</div>
	);
}
