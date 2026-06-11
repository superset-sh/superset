import { Crosshair, GitBranch, type LucideIcon, X } from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { IconButton } from "@/components/IconButton";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type AppliedFilterTagKind = "workspace" | "status";

const KIND_ICON: Record<AppliedFilterTagKind, LucideIcon> = {
	workspace: GitBranch,
	status: Crosshair,
};

export type AppliedFilterTagProps = Omit<PressableProps, "children"> & {
	kind: AppliedFilterTagKind;
	label: string;
	icon?: LucideIcon;
	onDismiss?: () => void;
	dismissAccessibilityLabel?: string;
};

/**
 * Dismissible chip representing one applied filter (UC-NAV-08 §C).
 *
 * Two kinds:
 *  - workspace: git-branch icon + `branch · host` label
 *  - status: status icon (defaults to Crosshair) + status name
 *
 * Renders a separate dismiss button so the tap targets are unambiguous:
 *  - Tap chip body → focus/scroll-into-view (optional caller behavior)
 *  - Tap ✕ → remove this filter only
 *
 * Composes IconButton for the dismiss. Used inside a horizontal-scroll row
 * that the host (ProjectChipHeader belowSearch slot) lays out.
 */
export function AppliedFilterTag({
	kind,
	label,
	icon,
	onDismiss,
	onPress,
	disabled,
	dismissAccessibilityLabel,
	className,
	...props
}: AppliedFilterTagProps) {
	const LeadingIcon = icon ?? KIND_ICON[kind];

	return (
		<View
			className={cn(
				"flex-row items-center gap-1 bg-secondary rounded-full pl-3 pr-1 h-8",
				disabled && "opacity-50",
				className,
			)}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Filter: ${label}`}
				onPress={onPress}
				disabled={disabled}
				className="flex-row items-center gap-1.5"
				{...props}
			>
				<Icon
					as={LeadingIcon}
					className={cn(
						"size-3.5",
						kind === "status" ? "text-state-live-fg" : "text-muted-foreground",
					)}
				/>
				<Text className="text-foreground text-sm">{label}</Text>
			</Pressable>
			<IconButton
				icon={X}
				accessibilityLabel={
					dismissAccessibilityLabel ?? `Remove filter: ${label}`
				}
				variant="ghost"
				size="xs"
				onPress={onDismiss}
				disabled={disabled}
			/>
		</View>
	);
}
