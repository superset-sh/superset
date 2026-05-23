import { cva, type VariantProps } from "class-variance-authority";
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Info,
	type LucideIcon,
	X,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, View, type ViewProps } from "react-native";
import { HitTargetWrapper } from "@/components/HitTargetWrapper";
import { ToolStatusRule } from "@/components/ToolStatusRule";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const toastVariants = cva(
	"flex-row items-stretch overflow-hidden rounded-xl border border-border bg-popover shadow-lg",
	{
		variants: {
			variant: {
				info: "",
				success: "",
				warning: "",
				danger: "",
				loading: "",
			},
			shape: {
				inline: "",
				stacked: "",
			},
		},
		defaultVariants: {
			variant: "info",
			shape: "inline",
		},
	},
);

export type ToastBaseVariant =
	| "info"
	| "success"
	| "warning"
	| "danger"
	| "loading";

type Mapping = {
	ruleVariant: "running" | "done" | "pending" | "error" | "neutral";
	defaultIcon: LucideIcon;
	iconColor: string;
};

const variantMapping: Record<ToastBaseVariant, Mapping> = {
	info: {
		ruleVariant: "neutral",
		defaultIcon: Info,
		iconColor: "text-primary",
	},
	success: {
		ruleVariant: "done",
		defaultIcon: CheckCircle2,
		iconColor: "text-state-success-fg",
	},
	warning: {
		ruleVariant: "pending",
		defaultIcon: AlertTriangle,
		iconColor: "text-state-warning-fg",
	},
	danger: {
		ruleVariant: "error",
		defaultIcon: AlertCircle,
		iconColor: "text-state-danger-fg",
	},
	loading: {
		ruleVariant: "running",
		defaultIcon: Info,
		iconColor: "text-muted-foreground",
	},
};

export type ToastBaseProps = ViewProps &
	VariantProps<typeof toastVariants> & {
		variant?: ToastBaseVariant;
		shape?: "inline" | "stacked";
		body: string;
		/** Stacked shape only — bolded title above the body. */
		title?: string;
		/** Override the default lucide icon for this variant. */
		icon?: LucideIcon;
		/** Optional action button slot (e.g. Retry, Open Settings). */
		action?: ReactNode;
		/** When provided, renders a ✕ dismiss button wrapped in a 44pt HitTargetWrapper. */
		onDismiss?: () => void;
		dismissAccessibilityLabel?: string;
		accessibilityLabel?: string;
	};

/**
 * Single transient notification surface. Caller manages timeout + position.
 *
 * Per atom · toast-base spec:
 *  - 5 variants: info (default) · success · warning · danger · loading.
 *  - 2 shapes: inline (icon · body · actions in one row) · stacked
 *    (title row → body row → action row, useful for longer messages).
 *  - Variant color is conveyed via the 3px left ToolStatusRule + matching
 *    icon tint; the surface itself stays neutral (bg-popover) for legibility.
 *  - `loading` swaps the leading icon for ActivityIndicator.
 *  - `onDismiss` renders ✕ inside HitTargetWrapper for a guaranteed 44pt
 *    touch target on a 14px visual glyph.
 *
 * Composes existing internals: ToolStatusRule + Icon + Text + HitTargetWrapper.
 * No external vendor component fits the left-rule layout cleanly.
 */
export function ToastBase({
	variant = "info",
	shape = "inline",
	body,
	title,
	icon,
	action,
	onDismiss,
	dismissAccessibilityLabel,
	accessibilityLabel,
	className,
	...props
}: ToastBaseProps) {
	const mapping = variantMapping[variant];
	const resolvedIcon = icon ?? mapping.defaultIcon;
	const isStacked = shape === "stacked";

	return (
		<View
			accessibilityRole="alert"
			accessibilityLiveRegion="polite"
			accessibilityLabel={accessibilityLabel ?? title ?? body}
			className={cn(toastVariants({ variant, shape }), className)}
			{...props}
		>
			<ToolStatusRule variant={mapping.ruleVariant} orientation="vertical" />
			<View
				className={cn(
					"flex-1 flex-row gap-3 px-3 py-3",
					isStacked ? "items-start" : "items-center",
				)}
			>
				<View className={cn(isStacked ? "pt-0.5" : "")}>
					{variant === "loading" ? (
						<ActivityIndicator size="small" className={mapping.iconColor} />
					) : (
						<Icon
							as={resolvedIcon}
							className={cn(
								isStacked ? "size-4" : "size-3.5",
								mapping.iconColor,
							)}
						/>
					)}
				</View>

				<View className={cn("flex-1", isStacked ? "gap-1" : "")}>
					{isStacked && title ? (
						<Text className="font-semibold text-foreground">{title}</Text>
					) : null}
					<Text className="text-sm text-foreground">{body}</Text>
					{isStacked && action ? <View className="pt-1">{action}</View> : null}
				</View>

				{!isStacked && action ? <View>{action}</View> : null}
				{onDismiss ? (
					<HitTargetWrapper
						accessibilityLabel={dismissAccessibilityLabel ?? "Dismiss"}
						shape="circle"
						onPress={onDismiss}
					>
						<Icon as={X} className="size-3.5 text-muted-foreground" />
					</HitTargetWrapper>
				) : null}
			</View>
		</View>
	);
}
