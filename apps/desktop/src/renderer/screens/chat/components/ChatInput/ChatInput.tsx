/**
 * Chat input component with send button
 */

import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import {
	type KeyboardEvent,
	useCallback,
	useRef,
	useState,
} from "react";

export interface ChatInputProps {
	onSend: (message: string) => void;
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

	const handleSend = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;

		onSend(trimmed);
		setValue("");
		onTypingChange?.(false);

		// Focus back on textarea
		textareaRef.current?.focus();
	}, [value, disabled, onSend, onTypingChange]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setValue(e.target.value);

			// Debounced typing indicator
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}

			if (e.target.value.trim()) {
				onTypingChange?.(true);
				typingTimeoutRef.current = setTimeout(() => {
					onTypingChange?.(false);
				}, 2000);
			} else {
				onTypingChange?.(false);
			}
		},
		[onTypingChange],
	);

	return (
		<div className={cn("flex gap-2", className)}>
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
				onClick={handleSend}
				disabled={disabled || !value.trim()}
				size="default"
			>
				Send
			</Button>
		</div>
	);
}
