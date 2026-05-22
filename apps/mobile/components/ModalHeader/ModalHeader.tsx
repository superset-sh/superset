import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { IconButton } from "@/components/IconButton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ModalHeaderProps = ViewProps & {
	title: string;
	onClose?: () => void;
	closeAccessibilityLabel?: string;
	/** Optional trailing slot (e.g. Save / Share button). Replaces the centering spacer. */
	action?: ReactNode;
	/** When true, title left-aligns instead of center (no spacer). */
	simple?: boolean;
	/** Adds subtle shadow when modal body scrolls beneath. */
	isScrolled?: boolean;
};

/**
 * Modal-specific header for full-screen sheets (UC-PAUSE-03 §A). Distinct from
 * AppHeader — modals dismiss rather than navigate back.
 *
 * Per mol-modal-header spec:
 *  - default: leading ✕ + centered title + invisible spacer (mirrors close width)
 *  - with action: spacer replaced by trailing slot (e.g. <Button>Save</Button>)
 *  - simple: leading ✕ + left-aligned title, no spacer
 *  - isScrolled adds 1px shadow
 *
 * Composes first-party IconButton + Text.
 */
export function ModalHeader({
	title,
	onClose,
	closeAccessibilityLabel = `Close ${title}`,
	action,
	simple = false,
	isScrolled = false,
	className,
	...props
}: ModalHeaderProps) {
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
			<IconButton
				icon={X}
				accessibilityLabel={closeAccessibilityLabel}
				variant="ghost"
				size="md"
				onPress={onClose}
			/>

			<View
				className={cn("flex-1", simple ? "items-start pl-2" : "items-center")}
			>
				<Text className="font-semibold text-foreground" numberOfLines={1}>
					{title}
				</Text>
			</View>

			{simple ? null : action ? (
				<View>{action}</View>
			) : (
				// Spacer that mirrors the close button width (44pt) to center the title.
				<View className="w-touch-min" />
			)}
		</View>
	);
}
