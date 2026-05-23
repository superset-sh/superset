import { ArrowLeft, type LucideIcon, MoreVertical } from "lucide-react-native";
import { View, type ViewProps } from "react-native";
import { IconButton } from "@/components/IconButton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type AppHeaderProps = ViewProps & {
	title: string;
	subtitle?: string;
	/** Show the leading back button. Default true. */
	showBack?: boolean;
	onBack?: () => void;
	backAccessibilityLabel?: string;
	/** Show the trailing actions button. Default true. */
	showActions?: boolean;
	onActions?: () => void;
	actionsAccessibilityLabel?: string;
	/** Override the trailing actions icon (default MoreVertical). */
	actionsIcon?: LucideIcon;
	/** Adds a layered shadow for visual separation from scrolling content. */
	isScrolled?: boolean;
};

/**
 * Top navigation header on every chat view (UC-RENDER-01 §A, UC-SESS-04 §A).
 *
 * Per mol-app-header spec:
 *  - Three-region flex: leading back (optional) + centered title/subtitle + trailing actions (optional)
 *  - Subtitle (project · branch) appears below the title in --md type-meta
 *  - `isScrolled` adds a 1px bottom shadow for layered separation
 *
 * Composes first-party IconButton + Text.
 */
export function AppHeader({
	title,
	subtitle,
	showBack = true,
	onBack,
	backAccessibilityLabel = "Back to sessions",
	showActions = true,
	onActions,
	actionsAccessibilityLabel = "Session actions",
	actionsIcon = MoreVertical,
	isScrolled = false,
	className,
	...props
}: AppHeaderProps) {
	return (
		<View
			accessibilityRole="header"
			className={cn(
				"flex-row items-center min-h-touch-min px-3 py-2 bg-background border-b border-border",
				isScrolled && "shadow-sm",
				className,
			)}
			{...props}
		>
			{showBack ? (
				<IconButton
					icon={ArrowLeft}
					accessibilityLabel={backAccessibilityLabel}
					variant="ghost"
					size="md"
					onPress={onBack}
				/>
			) : (
				<View className="w-1" />
			)}

			<View
				className={cn(
					"flex-1 gap-0.5",
					showBack ? "items-center" : "items-start pl-2",
				)}
			>
				<Text className="font-semibold text-foreground" numberOfLines={1}>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="muted" className="text-xs" numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>

			{showActions ? (
				<IconButton
					icon={actionsIcon}
					accessibilityLabel={actionsAccessibilityLabel}
					variant="ghost"
					size="md"
					onPress={onActions}
				/>
			) : (
				<View className="w-1" />
			)}
		</View>
	);
}
