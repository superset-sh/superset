import { cva, type VariantProps } from "class-variance-authority";
import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

const toolStatusRuleVariants = cva("rounded-full", {
	variants: {
		variant: {
			running: "bg-state-live-fg",
			completed: "bg-state-success-fg",
			failed: "bg-state-danger-fg",
			pending: "bg-state-warning-fg",
			neutral: "bg-border",
			ember: "bg-tool-rule",
		},
	},
	defaultVariants: {
		variant: "running",
	},
});

export type ToolStatusRuleProps = ViewProps &
	VariantProps<typeof toolStatusRuleVariants> & {
		/** Rule thickness in px. Default 3 — matches design system. */
		thickness?: number;
	};

/**
 * Colored left-edge rule used to indicate tool-call status (UC-RENDER-04) and
 * pending-approval state (UC-PAUSE-01). Renders as a thin vertical bar; size
 * the parent for height — this component sets only its width.
 *
 * Default 3px thickness matches `--domain-tool-rule-width` in the design system.
 */
export function ToolStatusRule({
	variant,
	thickness = 3,
	className,
	style,
	...props
}: ToolStatusRuleProps) {
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={[{ width: thickness }, style]}
			className={cn(
				toolStatusRuleVariants({ variant }),
				"h-full self-stretch",
				className,
			)}
			{...props}
		/>
	);
}
