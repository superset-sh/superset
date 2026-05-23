import {
	Brain,
	type LucideIcon,
	Shield,
	ShieldCheck,
	ShieldOff,
} from "lucide-react-native";
import { Pressable, type PressableProps } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type PermissionMode =
	| "default"
	| "acceptEdits"
	| "plan"
	| "bypassPermissions";

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

const PERMISSION_ICON: Record<PermissionMode, LucideIcon> = {
	default: Shield,
	acceptEdits: ShieldCheck,
	plan: Shield,
	bypassPermissions: ShieldOff,
};

export type ComposerSettingsButtonProps = PressableProps & {
	/** Current model display name — truncated past ~180pt. */
	modelName: string;
	permissionMode?: PermissionMode;
	thinkingLevel?: ThinkingLevel;
	/** Open state — accessibility hint, doesn't change visual chrome itself. */
	isOpen?: boolean;
};

/**
 * Single trigger pill that opens the composer settings bottom-sheet on mobile.
 * Mirrors desktop ComposerSettingsMenu (SUPER-755 / PR #4866) — consolidates
 * the legacy 3 sibling pills (Model · Permission · Thinking) into one tap
 * surface that surfaces all 3 indicators at a glance.
 *
 * Trigger anatomy: [Shield (perm variant)] [ModelName (truncate)] [Brain (status)]
 *
 * State via semantic color, NEVER opacity (per binding scope amendment §1):
 *  - BrainIcon → text-muted-foreground (thinking off) / text-foreground (any on level)
 *  - ShieldIcon → always text-foreground (permission is never "off")
 *  - Trigger always uses pressable cursor; never visually disabled
 *
 * Caller wires onPress to open a bottom sheet that contains:
 *   - Model section (radio rows)
 *   - Permission section (4 modes)
 *   - Thinking section (5 levels)
 *
 * The bottom sheet itself is an organism-level molecule deferred to Wave 3
 * (needs `@gorhom/bottom-sheet` or similar sheet primitive).
 *
 * Composes vendor Icon + Text; otherwise pure Pressable.
 */
export function ComposerSettingsButton({
	modelName,
	permissionMode = "default",
	thinkingLevel = "off",
	isOpen,
	disabled,
	className,
	accessibilityLabel,
	...props
}: ComposerSettingsButtonProps) {
	const PermissionIcon = PERMISSION_ICON[permissionMode];
	const isThinkingOn = thinkingLevel !== "off";
	const composedAccessibilityLabel =
		accessibilityLabel ??
		`Composer settings — Model: ${modelName} · Permission: ${permissionMode} · Thinking: ${thinkingLevel}`;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={composedAccessibilityLabel}
			accessibilityState={{
				expanded: isOpen ?? false,
				disabled: disabled ?? false,
			}}
			disabled={disabled}
			className={cn(
				"flex-row items-center gap-1.5 h-7 px-3 rounded-full border border-border bg-card active:opacity-70",
				isOpen && "bg-accent",
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			<Icon as={PermissionIcon} className="size-3.5 text-foreground" />
			<Text
				className="text-xs font-medium text-foreground max-w-44"
				numberOfLines={1}
			>
				{modelName}
			</Text>
			<Icon
				as={Brain}
				className={cn(
					"size-3.5",
					isThinkingOn ? "text-foreground" : "text-muted-foreground",
				)}
			/>
		</Pressable>
	);
}
