/**
 * Chat input component with send button
 */

import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { Send } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";

export interface ChatInputProps {
	onSend: (content: string) => void;
	onTypingChange?: (isTyping: boolean) => void;
	disabled?: boolean;
	placeholder?: string;
	className?: string;
	/** Button style: "icon" shows Send icon, "text" shows "Send" label */
	buttonVariant?: "icon" | "text";
	/** Auto-resize textarea as content grows (default: true) */
	autoResize?: boolean;
	/** Controlled value (optional - if provided, component is controlled) */
	value?: string;
	/** Controlled onChange (optional - required if value is provided) */
	onChange?: (value: string) => void;
}

export function ChatInput({
	onSend,
	onTypingChange,
	disabled = false,
	placeholder = "Type a message...",
	className,
	buttonVariant = "icon",
	autoResize = true,
	value: controlledValue,
	onChange: controlledOnChange,
}: ChatInputProps) {
	const [internalValue, setInternalValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Support both controlled and uncontrolled modes
	const isControlled = controlledValue !== undefined;
	const value = isControlled ? controlledValue : internalValue;
	const setValue = isControlled
		? (v: string) => controlledOnChange?.(v)
		: setInternalValue;

	const handleSubmit = useCallback(() => {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;

		onSend(trimmed);
		setValue("");
		onTypingChange?.(false);

		// Reset textarea height and focus
		if (textareaRef.current) {
			if (autoResize) {
				textareaRef.current.style.height = "auto";
			}
			textareaRef.current.focus();
		}
	}, [value, disabled, onSend, onTypingChange, autoResize, setValue]);

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
			const newValue = e.target.value;
			setValue(newValue);

			// Auto-resize textarea
			if (autoResize) {
				const textarea = e.target;
				textarea.style.height = "auto";
				textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
			}

			// Typing indicator with debounce
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}

			if (newValue.trim()) {
				onTypingChange?.(true);
				typingTimeoutRef.current = setTimeout(() => {
					onTypingChange?.(false);
				}, 2000);
			} else {
				onTypingChange?.(false);
			}
		},
		[onTypingChange, autoResize, setValue],
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
			{buttonVariant === "icon" ? (
				<Button
					size="icon"
					onClick={handleSubmit}
					disabled={disabled || !value.trim()}
					className="shrink-0"
				>
					<Send className="h-4 w-4" />
				</Button>
			) : (
				<Button
					onClick={handleSubmit}
					disabled={disabled || !value.trim()}
					size="default"
				>
					Send
				</Button>
			)}
		</div>
	);
}
