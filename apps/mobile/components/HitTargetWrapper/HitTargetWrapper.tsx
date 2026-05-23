import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { Pressable, type PressableProps, View } from "react-native";
import { cn } from "@/lib/utils";

const hitTargetWrapperVariants = cva(
	"size-touch-min items-center justify-center",
	{
		variants: {
			shape: {
				square: "rounded-none",
				circle: "rounded-full",
			},
			debug: {
				true: "border border-dashed border-state-warning-fg",
				false: "",
			},
		},
		defaultVariants: {
			shape: "square",
			debug: false,
		},
	},
);

export type HitTargetWrapperProps = PressableProps &
	VariantProps<typeof hitTargetWrapperVariants> & {
		accessibilityLabel: string;
		children: ReactNode;
	};

/**
 * Invisible 44pt tap-zone wrapper. Use when a visual glyph (14px ✕, 16px
 * chevron, 10px drag handle) needs a WCAG-compliant tap target without growing
 * its visual rendering.
 *
 * Per atom · hit-target-wrapper spec:
 *  - The wrapper IS the Pressable. Children are decorative
 *    (`accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`).
 *  - Required `accessibilityLabel` describes the action.
 *  - `shape="circle"` for round tap zones (dismiss badges).
 *  - `debug={true}` renders a dashed amber outline for design review — never ship.
 */
export function HitTargetWrapper({
	accessibilityLabel,
	shape,
	debug,
	disabled,
	className,
	children,
	...props
}: HitTargetWrapperProps) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled: disabled ?? false }}
			disabled={disabled}
			className={cn(
				hitTargetWrapperVariants({ shape, debug }),
				"active:bg-accent/40",
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			<View
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			>
				{children}
			</View>
		</Pressable>
	);
}
