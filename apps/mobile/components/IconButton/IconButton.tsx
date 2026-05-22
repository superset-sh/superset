import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, type PressableProps } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
	"items-center justify-center rounded-md active:opacity-70",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				primary: "bg-primary",
				secondary: "bg-secondary",
				ghost: "bg-transparent active:bg-accent",
				destructive: "bg-destructive",
			},
			size: {
				sm: "size-touch-min p-2", // 44pt min — touch target compliant
				md: "size-touch-min p-2.5",
				lg: "h-touch-min w-touch-min p-3", // explicit 44pt for icon-only
			},
		},
		defaultVariants: {
			variant: "default",
			size: "md",
		},
	},
);

const iconColorByVariant: Record<
	NonNullable<VariantProps<typeof iconButtonVariants>["variant"]>,
	string
> = {
	default: "text-foreground",
	primary: "text-primary-foreground",
	secondary: "text-secondary-foreground",
	ghost: "text-foreground",
	destructive: "text-destructive-foreground",
};

const iconSizeByButton: Record<
	NonNullable<VariantProps<typeof iconButtonVariants>["size"]>,
	string
> = {
	sm: "size-4",
	md: "size-5",
	lg: "size-6",
};

export type IconButtonProps = PressableProps &
	VariantProps<typeof iconButtonVariants> & {
		icon: LucideIcon;
		accessibilityLabel: string;
		iconClassName?: string;
	};

/**
 * Pressable button rendering a single Lucide icon. Guarantees the WCAG / iOS HIG
 * 44pt minimum hit target via the `touch-min` spacing token.
 *
 * Used across chat for Send / Stop / Close / Back / More / Copy and any other
 * icon-only affordance. Pair with `accessibilityLabel` (required) for screen
 * reader support.
 */
export function IconButton({
	icon,
	accessibilityLabel,
	className,
	variant,
	size,
	iconClassName,
	disabled,
	...props
}: IconButtonProps) {
	const resolvedVariant = variant ?? "default";
	const resolvedSize = size ?? "md";
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			disabled={disabled}
			className={cn(
				iconButtonVariants({ variant: resolvedVariant, size: resolvedSize }),
				disabled && "opacity-50",
				className,
			)}
			hitSlop={4}
			{...props}
		>
			<Icon
				as={icon}
				className={cn(
					iconSizeByButton[resolvedSize],
					iconColorByVariant[resolvedVariant],
					iconClassName,
				)}
			/>
		</Pressable>
	);
}
