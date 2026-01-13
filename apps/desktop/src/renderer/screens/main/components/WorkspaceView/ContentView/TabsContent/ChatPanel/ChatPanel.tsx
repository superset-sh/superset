"use client";

import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuCornerDownLeft, LuRotateCcw, LuSquare, LuX } from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useChatPanelStore } from "renderer/stores";

interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export function ChatPanel() {
	const { togglePanel } = useChatPanelStore();
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-scroll to bottom on new messages
	const messagesLength = messages.length;
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messagesLength, isLoading]);

	// Focus textarea on mount
	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	const handleSubmit = () => {
		if (!input.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			id: `user-${Date.now()}`,
			role: "user",
			content: input.trim(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setIsLoading(true);

		// TODO: Implement actual chat with tRPC in Milestone 2
		setTimeout(() => {
			const assistantMessage: ChatMessage = {
				id: `assistant-${Date.now()}`,
				role: "assistant",
				content:
					"This is a placeholder response. The chat will be connected to Claude in Milestone 2.",
			};
			setMessages((prev) => [...prev, assistantMessage]);
			setIsLoading(false);
			textareaRef.current?.focus();
		}, 800);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleClear = () => {
		setMessages([]);
		setInput("");
		textareaRef.current?.focus();
	};

	const handleStop = () => {
		setIsLoading(false);
	};

	return (
		<div className="flex flex-col h-full border-l border-border bg-background">
			{/* Header - minimal */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-border">
				<span className="text-xs font-medium text-muted-foreground">Chat</span>
				<div className="flex items-center gap-1">
					{messages.length > 0 && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-6"
									onClick={handleClear}
								>
									<LuRotateCcw className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">New conversation</TooltipContent>
						</Tooltip>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-6"
								onClick={togglePanel}
							>
								<LuX className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<HotkeyTooltipContent
								label="Close"
								hotkeyId="TOGGLE_CHAT_PANEL"
							/>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Messages */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto">
				{messages.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full p-6 text-center">
						<p className="text-xs text-muted-foreground">
							Ask about your code, tasks, or workflow
						</p>
					</div>
				) : (
					<div className="p-3 space-y-4">
						{messages.map((message) => (
							<div
								key={message.id}
								className={cn(
									"text-sm leading-relaxed",
									message.role === "user"
										? "text-foreground"
										: "text-muted-foreground",
								)}
							>
								<div
									className={cn(
										"text-[10px] font-medium uppercase tracking-wide mb-1",
										message.role === "user"
											? "text-foreground/50"
											: "text-muted-foreground/70",
									)}
								>
									{message.role === "user" ? "You" : "Assistant"}
								</div>
								<div className="whitespace-pre-wrap">{message.content}</div>
							</div>
						))}
						{isLoading && (
							<div className="text-sm">
								<div className="text-[10px] font-medium uppercase tracking-wide mb-1 text-muted-foreground/70">
									Assistant
								</div>
								<div className="flex items-center gap-1">
									<span className="size-1.5 rounded-full bg-foreground/40 animate-pulse" />
									<span
										className="size-1.5 rounded-full bg-foreground/40 animate-pulse"
										style={{ animationDelay: "150ms" }}
									/>
									<span
										className="size-1.5 rounded-full bg-foreground/40 animate-pulse"
										style={{ animationDelay: "300ms" }}
									/>
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Input */}
			<div className="p-3 border-t border-border">
				<div className="relative">
					<Textarea
						ref={textareaRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Message..."
						disabled={isLoading}
						className={cn(
							"min-h-[60px] max-h-[120px] resize-none pr-10 text-sm",
							"bg-muted/50 border-transparent focus:border-border focus:bg-background",
							"placeholder:text-muted-foreground/50",
						)}
						rows={2}
					/>
					<div className="absolute right-2 bottom-2">
						{isLoading ? (
							<Button
								size="icon"
								variant="ghost"
								className="size-6"
								onClick={handleStop}
							>
								<LuSquare className="size-3" />
							</Button>
						) : (
							<Button
								size="icon"
								variant="ghost"
								className="size-6"
								onClick={handleSubmit}
								disabled={!input.trim()}
							>
								<LuCornerDownLeft className="size-3.5" />
							</Button>
						)}
					</div>
				</div>
				<div className="mt-2 text-[10px] text-muted-foreground/50 text-center">
					Enter to send, Shift+Enter for new line
				</div>
			</div>
		</div>
	);
}
