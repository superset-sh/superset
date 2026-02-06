import { Send } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

export interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	onSend: (message: string) => void;
	disabled?: boolean;
	placeholder?: string;
}

export function ChatInput({
	value,
	onChange,
	onSend,
	disabled = false,
	placeholder = "Type a message...",
}: ChatInputProps) {
	const [isFocused, setIsFocused] = useState(false);

	const handleSend = () => {
		const trimmed = value.trim();
		if (trimmed && !disabled) {
			onSend(trimmed);
			onChange("");
		}
	};

	const canSend = value.trim().length > 0 && !disabled;

	return (
		<View className="flex-row items-end gap-2 px-4 py-3 border-t border-border bg-background">
			<View
				className={`flex-1 flex-row items-center bg-muted rounded-2xl px-4 py-2 ${
					isFocused ? "border border-primary" : ""
				}`}
			>
				<TextInput
					className="flex-1 text-base text-foreground min-h-[24px] max-h-[120px]"
					value={value}
					onChangeText={onChange}
					placeholder={placeholder}
					placeholderTextColor="#9ca3af"
					multiline
					editable={!disabled}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onSubmitEditing={handleSend}
				/>
			</View>
			<Pressable
				onPress={handleSend}
				disabled={!canSend}
				className={`w-10 h-10 rounded-full items-center justify-center ${
					canSend ? "bg-primary" : "bg-muted"
				}`}
			>
				<Send
					size={20}
					color={canSend ? "#ffffff" : "#9ca3af"}
					strokeWidth={2}
				/>
			</Pressable>
		</View>
	);
}
