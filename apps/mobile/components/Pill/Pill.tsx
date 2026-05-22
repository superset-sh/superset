import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const pillVariants = cva(
	"flex-row items-center gap-1 rounded-full border px-3 py-1.5",
	{
		variants: {
			variant: {
				default: "bg-card border-border",
				selected: "bg-primary/15 border-primary",
				warning: "bg-state-warning-bg border-state-warning-fg",
				danger: "bg-state-danger-bg border-state-danger-fg",
				success: "bg-state-success-bg border-state-success-fg",
				live: "bg-state-live-bg border-state-live-fg",
			},
			interactive: {
				true: "active:opacity-70",
				false: "",
			},
		},
		defaultVariants: {
			variant: "default",
			interactive: false,
		},
	},
);

const pillTextByVariant: Record<
	NonNullable<VariantProps<typeof pillVariants>["variant"]>,
	string
> = {
	default: "text-foreground",
	selected: "text-primary",
	warning: "text-state-warning-fg",
	danger: "text-state-danger-fg",
	success: "text-state-success-fg",
	live: "text-state-live-fg",
};

export type PillProps = PressableProps &
	VariantProps<typeof pillVariants> & {
		label: string;
		leadingIcon?: LucideIcon;
		trailingIcon?: LucideIcon;
	};

/**
 * Chat-domain pill — model chip, mode chip, suggested-answer, pending-action,
 * status badge. Distinct from `Badge` (compact rounded label for counters) in
 * two ways: (1) larger touch surface (≥44pt total tap area when pressable),
 * (2) variant set tuned to chat status (live/warning/danger/success).
 *
 * Use `interactive=true` for tappable pills (suggested answers, applied filter
 * chips with remove ✕). Renders as a Pressable in that case; otherwise a View.
 */
export function Pill({
	label,
	leadingIcon,
	trailingIcon,
	variant,
	interactive,
	className,
	disabled,
	...props
}: PillProps) {
	const resolvedVariant = variant ?? "default";
	const resolvedInteractive = interactive ?? false;
	const sharedClass = cn(
		pillVariants({
			variant: resolvedVariant,
			interactive: resolvedInteractive,
		}),
		disabled && "opacity-50",
		className,
	);
	const contents = (
		<>
			{leadingIcon ? (
				<Icon
					as={leadingIcon}
					className={cn("size-3.5", pillTextByVariant[resolvedVariant])}
				/>
			) : null}
			<Text
				variant="small"
				className={cn("font-medium", pillTextByVariant[resolvedVariant])}
			>
				{label}
			</Text>
			{trailingIcon ? (
				<Icon
					as={trailingIcon}
					className={cn("size-3.5", pillTextByVariant[resolvedVariant])}
				/>
			) : null}
		</>
	);
	if (resolvedInteractive) {
		return (
			<Pressable
				disabled={disabled}
				accessibilityRole="button"
				accessibilityLabel={label}
				className={sharedClass}
				{...props}
			>
				{contents}
			</Pressable>
		);
	}
	return <View className={sharedClass}>{contents}</View>;
}
