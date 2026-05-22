import { cva, type VariantProps } from "class-variance-authority";
import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

const statusDotVariants = cva("rounded-full", {
	variants: {
		variant: {
			live: "bg-state-live-fg",
			warning: "bg-state-warning-fg",
			danger: "bg-state-danger-fg",
			success: "bg-state-success-fg",
			neutral: "bg-state-neutral-fg",
			ember: "bg-primary",
		},
		size: {
			sm: "size-1.5",
			md: "size-2",
			lg: "size-2.5",
		},
	},
	defaultVariants: {
		variant: "neutral",
		size: "md",
	},
});

export type StatusDotProps = ViewProps &
	VariantProps<typeof statusDotVariants> & {
		/** Optional accessibility label — e.g. "Streaming" */
		accessibilityLabel?: string;
	};

/**
 * Single colored circle indicating status. Variants drawn from the state palette
 * (live · warning · danger · success · neutral) plus `ember` for brand emphasis.
 *
 * Used in session rows (status icon column), live-activity indicators, and any
 * inline glyph where a colored bullet is more compact than a full Badge or Pill.
 */
export function StatusDot({
	variant,
	size,
	className,
	accessibilityLabel,
	...props
}: StatusDotProps) {
	return (
		<View
			accessibilityLabel={accessibilityLabel}
			accessibilityRole={accessibilityLabel ? "image" : undefined}
			className={cn(statusDotVariants({ variant, size }), className)}
			{...props}
		/>
	);
}
