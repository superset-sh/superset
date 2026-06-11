import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type EmptyStateProps = ViewProps & {
	icon: LucideIcon;
	heading: string;
	body?: string;
	/** Optional CTA slot — usually a Button or Pressable. */
	cta?: ReactNode;
};

/**
 * Centered "nothing here yet" body for sessions-list and other list-empty
 * surfaces. Composes:
 *  - Oversized faint Lucide icon (size 48)
 *  - Heading (type-title)
 *  - Body copy (muted)
 *  - Optional CTA slot
 *
 * Used by the 5 sessions-list empty variants (UC-NAV-06.1 through .5).
 */
export function EmptyState({
	icon,
	heading,
	body,
	cta,
	className,
	...props
}: EmptyStateProps) {
	return (
		<View
			accessibilityRole="summary"
			className={cn("flex-1 items-center justify-center gap-3 px-8", className)}
			{...props}
		>
			<Icon as={icon} className="text-muted-foreground size-12" />
			<Text className="text-foreground text-lg font-semibold text-center">
				{heading}
			</Text>
			{body ? (
				<Text variant="muted" className="text-center leading-6">
					{body}
				</Text>
			) : null}
			{cta ? <View className="mt-2">{cta}</View> : null}
		</View>
	);
}
