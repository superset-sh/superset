/**
 * Chat input with send button
 */

"use client";

import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { Send } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

export interface ChatInputProps {
	onSend: (content: string) => void;
	onTypingChange?: (isTyping: boolean) => void;
	disabled?: boolean;
	placeholder?: string;
	className?: string;
}

export function ChatInput({
	onSend,
	onTypingChange,
	disabled = false,
	placeholder = "Type a message...",
	className,
}: ChatInputProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleSubmit = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;

		onSend(trimmed);
		setValue("");
		onTypingChange?.(false);

		// Reset textarea height
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [value, disabled, onSend, onTypingChange]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setValue(e.target.value);

			// Auto-resize textarea
			const textarea = e.target;
			textarea.style.height = "auto";
			textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;

			// Typing indicator with debounce
			onTypingChange?.(true);
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
			typingTimeoutRef.current = setTimeout(() => {
				onTypingChange?.(false);
			}, 2000);
		},
		[onTypingChange],
	);

	return (
		<div className={cn("flex gap-2 items-end", className)}>
			<Textarea
				ref={textareaRef}
				value={value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				disabled={disabled}
				rows={1}
				className="min-h-[40px] max-h-[200px] resize-none"
			/>
			<Button
				size="icon"
				onClick={handleSubmit}
				disabled={disabled || !value.trim()}
				className="shrink-0"
			>
				<Send className="h-4 w-4" />
			</Button>
		</div>
	);
}
