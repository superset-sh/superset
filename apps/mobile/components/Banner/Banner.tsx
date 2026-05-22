import {
	AlertTriangle,
	Bell,
	type LucideIcon,
	WifiOff,
	X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { IconButton } from "@/components/IconButton";
import { ToolStatusRule } from "@/components/ToolStatusRule";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type BannerVariant =
	| "offline"
	| "unpaid"
	| "dispatch-failed"
	| "permission-denied";

type VariantConfig = {
	bgClass: string;
	textClass: string;
	ruleVariant: "pending" | "error";
	defaultIcon: LucideIcon;
};

const VARIANT: Record<BannerVariant, VariantConfig> = {
	offline: {
		bgClass: "bg-state-warning-bg",
		textClass: "text-state-warning-fg",
		ruleVariant: "pending",
		defaultIcon: WifiOff,
	},
	unpaid: {
		bgClass: "bg-state-danger-bg",
		textClass: "text-state-danger-fg",
		ruleVariant: "error",
		defaultIcon: AlertTriangle,
	},
	"dispatch-failed": {
		bgClass: "bg-state-danger-bg",
		textClass: "text-state-danger-fg",
		ruleVariant: "error",
		defaultIcon: AlertTriangle,
	},
	"permission-denied": {
		bgClass: "bg-state-warning-bg",
		textClass: "text-state-warning-fg",
		ruleVariant: "pending",
		defaultIcon: Bell,
	},
};

export type BannerProps = ViewProps & {
	variant?: BannerVariant;
	shape?: "inline" | "stacked";
	headline: string;
	body?: string;
	icon?: LucideIcon;
	cta?: ReactNode;
	onDismiss?: () => void;
	dismissAccessibilityLabel?: string;
};

/**
 * Full-width status banner above chat (UC-PLATF-01 + UC-PLATF-03).
 *
 * Per mol-banner spec:
 *  - 4 variants: offline · unpaid · dispatch-failed · permission-denied
 *  - 2 shapes: inline (icon · headline · CTA in one row) · stacked
 *    (icon+headline row, then body, then CTA below)
 *  - Top horizontal ToolStatusRule accent in variant color
 *  - Optional dismiss IconButton via onDismiss
 *
 * Composes ToolStatusRule + Icon + Text + IconButton.
 */
export function Banner({
	variant = "offline",
	shape = "inline",
	headline,
	body,
	icon,
	cta,
	onDismiss,
	dismissAccessibilityLabel = "Dismiss",
	className,
	...props
}: BannerProps) {
	const cfg = VARIANT[variant];
	const resolvedIcon = icon ?? cfg.defaultIcon;
	const isStacked = shape === "stacked";

	return (
		<View
			accessibilityRole="alert"
			accessibilityLiveRegion="polite"
			className={cn("w-full overflow-hidden", cfg.bgClass, className)}
			{...props}
		>
			<ToolStatusRule variant={cfg.ruleVariant} orientation="horizontal" />
			<View className={cn("px-4 py-3", isStacked ? "gap-2" : "")}>
				<View
					className={cn(
						"flex-row items-center gap-2",
						isStacked ? "" : "justify-between",
					)}
				>
					<View className="flex-row items-center gap-2 flex-1">
						<Icon as={resolvedIcon} className={cn("size-4", cfg.textClass)} />
						<Text
							className={cn("flex-1 text-sm font-medium", cfg.textClass)}
							numberOfLines={isStacked ? undefined : 2}
						>
							{headline}
						</Text>
					</View>
					{!isStacked && cta ? <View>{cta}</View> : null}
					{onDismiss ? (
						<IconButton
							icon={X}
							accessibilityLabel={dismissAccessibilityLabel}
							variant="ghost"
							size="sm"
							onPress={onDismiss}
						/>
					) : null}
				</View>
				{isStacked && body ? (
					<Text className={cn("text-xs", cfg.textClass, "opacity-80")}>
						{body}
					</Text>
				) : null}
				{isStacked && cta ? <View className="self-start">{cta}</View> : null}
			</View>
		</View>
	);
}
