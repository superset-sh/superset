import { Send, Square } from "lucide-react-native";
import { View, type ViewProps } from "react-native";
import {
	ComposerSettingsButton,
	type PermissionMode,
	type ThinkingLevel,
} from "@/components/ComposerSettingsButton";
import { IconButton } from "@/components/IconButton";
import { ProgressDots } from "@/components/ProgressDots";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ComposerRowVariant = "idle" | "typing" | "streaming" | "sending";

export type ComposerRowProps = ViewProps & {
	variant?: ComposerRowVariant;
	value?: string;
	onChangeText?: (text: string) => void;
	onSend?: () => void;
	onStop?: () => void;
	placeholder?: string;
	/** Composer settings (model + permission + thinking) — pass undefined to hide the settings button. */
	settings?: {
		modelName: string;
		permissionMode?: PermissionMode;
		thinkingLevel?: ThinkingLevel;
		isOpen?: boolean;
		onPress?: () => void;
	};
};

/**
 * Composer cluster — settings button (top) + textarea + send/stop button (bottom).
 *
 * Per mol-composer-row spec + user feedback (mirror desktop PR #4866):
 *  - Settings button replaces the legacy 3-pickers toolbar. One tap opens
 *    a bottom sheet containing model · permission · thinking sections.
 *  - 4 state variants for the textarea/action: idle / typing / streaming / sending
 *  - streaming → Stop button (destructive); sending → ProgressDots
 *
 * Composes ComposerSettingsButton + vendor Textarea + first-party IconButton + ProgressDots.
 */
export function ComposerRow({
	variant = "idle",
	value,
	onChangeText,
	onSend,
	onStop,
	placeholder = "Type a message…",
	settings,
	className,
	...props
}: ComposerRowProps) {
	const isDisabled = variant === "streaming" || variant === "sending";

	return (
		<View
			accessibilityLabel="Compose message"
			className={cn("border-t border-border bg-background", className)}
			{...props}
		>
			{settings ? (
				<View className="px-3 pt-2 pb-1 flex-row">
					<ComposerSettingsButton
						modelName={settings.modelName}
						permissionMode={settings.permissionMode}
						thinkingLevel={settings.thinkingLevel}
						isOpen={settings.isOpen}
						onPress={settings.onPress}
						disabled={isDisabled}
					/>
				</View>
			) : null}

			<View className="flex-row items-end gap-2 px-3 pb-2 pt-1">
				<Textarea
					value={value}
					onChangeText={onChangeText}
					placeholder={
						variant === "streaming"
							? "(input disabled while turn is streaming)"
							: placeholder
					}
					editable={!isDisabled}
					className={cn(
						"flex-1 min-h-touch-min max-h-32",
						isDisabled && "opacity-60",
					)}
					multiline
				/>
				{variant === "sending" ? (
					<View className="size-touch-min items-center justify-center">
						<ProgressDots variant="accent" size="sm" />
					</View>
				) : variant === "streaming" ? (
					<IconButton
						icon={Square}
						accessibilityLabel="Stop streaming"
						variant="destructive"
						shape="pill"
						onPress={onStop}
					/>
				) : (
					<IconButton
						icon={Send}
						accessibilityLabel="Send message"
						variant="primary"
						shape="pill"
						onPress={onSend}
						disabled={variant === "idle"}
					/>
				)}
			</View>
		</View>
	);
}
