import { createStream } from "@superset/ai-chat/stream";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { useChatStore } from "../../../../chats/stores/chatStore";

const STREAM_SERVER_URL = env.NEXT_PUBLIC_STREAMS_URL;

export function ChatInputButton() {
	const navigate = useNavigate();
	const { createSession } = useChatStore();

	const handleClick = useCallback(async () => {
		const session = createSession();
		await createStream(STREAM_SERVER_URL, session.id);
		navigate({ to: "/chats/$chatId", params: { chatId: session.id } });
	}, [navigate, createSession]);

	return (
		<button
			type="button"
			onClick={handleClick}
			className={cn(
				"no-drag flex items-center gap-2 h-8 px-3 rounded-md",
				"bg-muted/50 border border-border/50",
				"text-muted-foreground text-sm",
				"hover:bg-muted hover:border-border hover:text-foreground",
				"transition-colors cursor-text",
				"min-w-[200px] max-w-[400px] flex-1",
			)}
		>
			<Sparkles className="size-4 shrink-0" />
			<span className="truncate">Ask AI...</span>
		</button>
	);
}
