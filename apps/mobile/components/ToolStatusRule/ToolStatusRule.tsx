import { cva, type VariantProps } from "class-variance-authority";
import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

const toolStatusRuleVariants = cva("rounded-sm", {
	variants: {
		variant: {
			running: "bg-state-live-fg",
			done: "bg-state-success-fg",
			pending: "bg-state-warning-fg",
			error: "bg-state-danger-fg",
			neutral: "bg-muted-foreground",
		},
		orientation: {
			// 3px = --domain-tool-rule-width per spec. Fixed; not configurable.
			vertical: "w-[3px] self-stretch min-h-6",
			horizontal: "h-[3px] w-full",
		},
	},
	defaultVariants: {
		variant: "running",
		orientation: "vertical",
	},
});

type ToolStatusRuleVariant = NonNullable<
	VariantProps<typeof toolStatusRuleVariants>["variant"]
>;

// RN custom-colored shadows have no NativeWind utility — keep these inline.
const glowStyleByVariant: Record<
	ToolStatusRuleVariant,
	ViewProps["style"] | undefined
> = {
	running: {
		shadowColor: "rgba(80, 168, 120, 0.6)",
		shadowOpacity: 1,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 0 },
	},
	pending: {
		shadowColor: "rgba(212, 168, 75, 0.6)",
		shadowOpacity: 1,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 0 },
	},
	done: undefined,
	error: undefined,
	neutral: undefined,
};

export type ToolStatusRuleProps = ViewProps &
	VariantProps<typeof toolStatusRuleVariants>;

/**
 * 3px colored rule indicating tool-call / approval status. Composed by
 * tool-call-card, plan/reasoning blocks, pending-approval-card, approval-footer.
 *
 * Per atom · tool-status-rule spec:
 *  - Status variants: running · done · pending · error · neutral.
 *  - Orientation: vertical (default, self-stretch + min-h-24) or horizontal
 *    (full-width × 3px tall, for approval-footer top edge).
 *  - `running` + `pending` carry a soft glow via shadowColor — kept inline
 *    because RN custom-colored shadows have no NativeWind utility equivalent.
 *
 * Decorative — `aria-hidden`. Status meaning MUST also be conveyed by the
 * parent card via text + icon.
 */
export function ToolStatusRule({
	variant,
	orientation,
	className,
	style,
	...props
}: ToolStatusRuleProps) {
	const resolvedVariant: ToolStatusRuleVariant = variant ?? "running";
	const resolvedOrientation = orientation ?? "vertical";
	const glow = glowStyleByVariant[resolvedVariant];
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={[glow, style]}
			className={cn(
				toolStatusRuleVariants({
					variant: resolvedVariant,
					orientation: resolvedOrientation,
				}),
				className,
			)}
			{...props}
		/>
	);
}
