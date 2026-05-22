import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// Override vendor Button geometry for icon-only square buttons.
// Vendor's `size="icon"` is 40×40 — we need explicit 28/36/44/56 per spec.
const iconButtonGeometry = cva("p-0", {
	variants: {
		variant: {
			ghost: "",
			soft: "bg-card active:bg-accent",
			primary: "",
			neutral: "bg-foreground active:bg-foreground/90",
			destructive: "",
		},
		size: {
			xs: "h-7 w-7",
			sm: "h-9 w-9",
			md: "h-touch-min w-touch-min", // 44pt — WCAG AA + iOS HIG default
			lg: "h-14 w-14",
		},
		shape: {
			default: "rounded-md",
			pill: "rounded-full",
		},
	},
	defaultVariants: {
		variant: "ghost",
		size: "md",
		shape: "default",
	},
});

type IconButtonVariant = NonNullable<
	VariantProps<typeof iconButtonGeometry>["variant"]
>;
type IconButtonSize = NonNullable<
	VariantProps<typeof iconButtonGeometry>["size"]
>;

// Map our 5 spec variants onto vendor Button's variants. `soft` and `neutral`
// have no vendor equivalent — they fall back to vendor `ghost` and add our own
// background via the geometry override above.
const vendorVariantByOurVariant: Record<
	IconButtonVariant,
	NonNullable<ButtonProps["variant"]>
> = {
	ghost: "ghost",
	soft: "ghost",
	primary: "default",
	neutral: "ghost",
	destructive: "destructive",
};

const iconColorByVariant: Record<IconButtonVariant, string> = {
	ghost: "text-foreground",
	soft: "text-foreground",
	primary: "text-primary-foreground",
	neutral: "text-background",
	destructive: "text-white",
};

const iconSizeBySize: Record<IconButtonSize, string> = {
	xs: "size-3.5", // 14px
	sm: "size-4", // 16px
	md: "size-5", // 20px
	lg: "size-6", // 24px
};

export type IconButtonProps = Omit<ButtonProps, "variant" | "size"> &
	VariantProps<typeof iconButtonGeometry> & {
		icon: LucideIcon;
		accessibilityLabel: string;
		iconClassName?: string;
		loading?: boolean;
	};

/**
 * Icon-only Button — composes vendor `<Button>` and overrides geometry to satisfy
 * the icon-button spec: 5 variants × 4 sizes (xs/sm/md/lg) × 2 shapes (default/pill).
 *
 * Default `md` size is 44pt (WCAG AA + iOS HIG). `soft` and `neutral` variants
 * fall back to vendor `ghost` and add bg via className — vendor doesn't ship
 * them.
 *
 * `loading` swaps the icon for ActivityIndicator and sets `accessibilityState.busy`.
 */
export function IconButton({
	icon,
	accessibilityLabel,
	className,
	variant,
	size,
	shape,
	iconClassName,
	disabled,
	loading,
	...props
}: IconButtonProps) {
	const resolvedVariant: IconButtonVariant = variant ?? "ghost";
	const resolvedSize: IconButtonSize = size ?? "md";
	const resolvedShape = shape ?? "default";
	const isDisabled = disabled || loading;
	return (
		<Button
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled: isDisabled, busy: loading ?? false }}
			disabled={isDisabled}
			variant={vendorVariantByOurVariant[resolvedVariant]}
			size="icon"
			className={cn(
				iconButtonGeometry({
					variant: resolvedVariant,
					size: resolvedSize,
					shape: resolvedShape,
				}),
				className,
			)}
			hitSlop={resolvedSize === "xs" || resolvedSize === "sm" ? 8 : 4}
			{...props}
		>
			{loading ? (
				<ActivityIndicator
					size="small"
					className={iconColorByVariant[resolvedVariant]}
				/>
			) : (
				<Icon
					as={icon}
					className={cn(
						iconSizeBySize[resolvedSize],
						iconColorByVariant[resolvedVariant],
						iconClassName,
					)}
				/>
			)}
		</Button>
	);
}
