import { createStream } from "@superset/ai-chat/stream";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { ChatView } from "renderer/screens/chat";
import { useChatStore } from "renderer/stores/chatStore";

const STREAM_SERVER_URL = "http://localhost:8080";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/chat/$chatId/",
)({
	component: ChatDetailPage,
});

function ChatDetailPage() {
	const { chatId } = Route.useParams();
	const navigate = useNavigate();
	const { sessions, createSession } = useChatStore();

	// Ensure stream exists when page loads
	useEffect(() => {
		createStream(STREAM_SERVER_URL, chatId).catch(console.error);
	}, [chatId]);

	const handleCreateChat = useCallback(async () => {
		const session = createSession();
		await createStream(STREAM_SERVER_URL, session.id);
		navigate({ to: "/chat/$chatId", params: { chatId: session.id } });
	}, [navigate, createSession]);

	const handleSelectChat = useCallback(
		async (id: string) => {
			await createStream(STREAM_SERVER_URL, id);
			navigate({ to: "/chat/$chatId", params: { chatId: id } });
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
										chatId === session.id && "bg-accent text-accent-foreground",
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

			{/* Chat View */}
			<div className="flex-1 min-w-0">
				<ChatView sessionId={chatId} className="h-full" />
			</div>
		</div>
	);
}
