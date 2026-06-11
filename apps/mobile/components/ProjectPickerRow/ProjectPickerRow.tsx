import { Check, Package } from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ProjectPickerRowProps = Omit<PressableProps, "children"> & {
	name: string;
	/** Subtitle e.g. "4 workspaces · 12 sessions" or "2 workspaces · no sessions yet". */
	subtitle?: string;
	selected?: boolean;
};

/**
 * Row in the ProjectPickerSheet (UC-NAV §B). Composes:
 *  - Leading package IconGlyph (muted)
 *  - Body: project name + subtitle (meta line)
 *  - Trailing check IconGlyph (ember accent), visible only when `selected`
 *
 * Selected row also gets `bg-accent` surface tint.
 */
export function ProjectPickerRow({
	name,
	subtitle,
	selected = false,
	onPress,
	disabled,
	className,
	...props
}: ProjectPickerRowProps) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Switch to project ${name}`}
			accessibilityState={{ selected, disabled: disabled ?? undefined }}
			onPress={onPress}
			disabled={disabled}
			className={cn(
				"flex-row items-center gap-3 px-4 min-h-touch-min py-3 active:bg-accent",
				selected && "bg-accent",
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			<Icon as={Package} className="text-muted-foreground size-5" />
			<View className="flex-1 gap-0.5">
				<Text className="text-foreground font-medium" numberOfLines={1}>
					{name}
				</Text>
				{subtitle ? (
					<Text variant="muted" className="text-xs">
						{subtitle}
					</Text>
				) : null}
			</View>
			{selected ? <Icon as={Check} className="text-primary size-5" /> : null}
		</Pressable>
	);
}
