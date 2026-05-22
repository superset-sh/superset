import { Plus, Send, Square } from "lucide-react-native";
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
	/** Tap handler for the leading commands (+) button. When omitted, the button is hidden. */
	onCommandsPress?: () => void;
	commandsAccessibilityLabel?: string;
};

/**
 * Composer cluster — Claude iOS layout. Single rounded container with the
 * textarea on top and an action toolbar inside the same chrome below.
 *
 * Toolbar order (mirrors Claude iOS reference):
 *  - LEFT: [+] commands button → [Shield/Model/Brain] settings pill
 *  - RIGHT: send / stop / progress-dots (state-driven swap)
 *
 * Variants (textarea + right slot):
 *  - idle      — empty input, Send disabled
 *  - typing    — populated input, Send active (primary ember)
 *  - streaming — input non-editable, Stop replaces Send (destructive)
 *  - sending   — input non-editable, ProgressDots replaces Send in 44pt slot
 *
 * Composes vendor Textarea + first-party IconButton + ComposerSettingsButton +
 * ProgressDots. The slash-command popover the `+` button opens is the host's
 * concern (organism, deferred to Wave 3).
 */
export function ComposerRow({
	variant = "idle",
	value,
	onChangeText,
	onSend,
	onStop,
	placeholder = "Type a message…",
	settings,
	onCommandsPress,
	commandsAccessibilityLabel = "Open commands",
	className,
	...props
}: ComposerRowProps) {
	const isDisabled = variant === "streaming" || variant === "sending";

	return (
		<View
			accessibilityLabel="Compose message"
			className={cn("px-3 py-2 bg-background", className)}
			{...props}
		>
			<View className="rounded-xl border border-border bg-card overflow-hidden">
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
						"min-h-12 max-h-32 px-3 py-2 bg-transparent border-0",
						isDisabled && "opacity-60",
					)}
					multiline
				/>

				<View className="flex-row items-center gap-2 px-2 pb-2">
					{onCommandsPress ? (
						<IconButton
							icon={Plus}
							accessibilityLabel={commandsAccessibilityLabel}
							variant="ghost"
							size="sm"
							onPress={onCommandsPress}
							disabled={isDisabled}
						/>
					) : null}

					{settings ? (
						<ComposerSettingsButton
							modelName={settings.modelName}
							permissionMode={settings.permissionMode}
							thinkingLevel={settings.thinkingLevel}
							isOpen={settings.isOpen}
							onPress={settings.onPress}
							disabled={isDisabled}
						/>
					) : null}

					<View className="flex-1" />

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
		</View>
	);
}
