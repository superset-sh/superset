import { useEffect, useRef, useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { ChatInput } from "./ChatInput";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
}

interface ChatPanelProps {
	onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	const lastUserMessage = [...messages]
		.reverse()
		.find((m) => m.role === "user");
	const lastAssistantMessage = [...messages]
		.reverse()
		.find((m) => m.role === "assistant");
	const hasMessages = messages.length > 0;

	const handleSubmit = () => {
		if (!input.trim() || isLoading) return;

		const userMessage: Message = {
			id: crypto.randomUUID(),
			role: "user",
			content: input.trim(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setIsLoading(true);

		// Mock assistant response - TODO: replace with actual AI integration
		timeoutRef.current = setTimeout(() => {
			const assistantMessage: Message = {
				id: crypto.randomUUID(),
				role: "assistant",
				content: "This is a placeholder response. AI integration coming soon.",
			};
			setMessages((prev) => [...prev, assistantMessage]);
			setIsLoading(false);
		}, 1500);
	};

	return (
		<div className="h-full flex flex-col bg-background border-l border-border">
			<div className="p-3 border-b border-border flex items-center justify-between">
				<span className="text-sm font-medium">Chat</span>
				<button
					type="button"
					onClick={onClose}
					className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
				>
					<HiMiniXMark className="size-4" />
				</button>
			</div>

			{!hasMessages ? (
				<>
					<ChatInput
						value={input}
						onChange={setInput}
						onSubmit={handleSubmit}
						placeholder="Type a message..."
						isLoading={isLoading}
					/>
					<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
						Start a conversation
					</div>
				</>
			) : (
				<>
					{/* Last user message pinned at top */}
					{lastUserMessage && (
						<div className="m-2 p-3 bg-accent rounded-md border border-accent-foreground/20 flex items-start justify-between gap-2">
							<span className="text-sm">{lastUserMessage.content}</span>
						</div>
					)}
					{/* Assistant response */}
					<div className="flex-1 overflow-y-auto px-4 py-2">
						{isLoading ? (
							<p className="text-sm text-muted-foreground">
								Planning next moves
							</p>
						) : lastAssistantMessage ? (
							<p className="text-sm">{lastAssistantMessage.content}</p>
						) : null}
					</div>

					{/* Follow-up input at bottom */}
					<ChatInput
						value={input}
						onChange={setInput}
						onSubmit={handleSubmit}
						placeholder="Add a follow-up"
						isLoading={isLoading}
					/>
				</>
			)}
		</div>
	);
}
