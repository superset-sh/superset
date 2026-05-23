import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon, X } from "lucide-react-native";
import { Pressable, type PressableProps } from "react-native";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// Pill composes vendor <Badge> (already rounded-full + asChild slot). We
// override variant tinting + size geometry via className. For interactive
// pills, asChild swaps the underlying View for our Pressable so the Badge
// styling still applies but the tap surface is real.
const pillVariants = cva("", {
	variants: {
		variant: {
			default: "bg-card border-border",
			strong: "bg-accent border-border",
			accent: "bg-primary/15 border-transparent",
			live: "bg-state-live-bg border-transparent",
			warning: "bg-state-warning-bg border-transparent",
			danger: "bg-state-danger-bg border-transparent",
		},
		size: {
			sm: "h-5 px-2 gap-1",
			md: "h-7 px-3 gap-1.5",
			lg: "h-9 px-4 gap-2",
		},
		selected: {
			true: "bg-accent border-border",
			false: "",
		},
		interactive: {
			true: "active:opacity-70",
			false: "",
		},
	},
	defaultVariants: {
		variant: "default",
		size: "md",
		selected: false,
		interactive: false,
	},
});

type PillVariant = NonNullable<VariantProps<typeof pillVariants>["variant"]>;
type PillSize = NonNullable<VariantProps<typeof pillVariants>["size"]>;

const pillTextColorByVariant: Record<PillVariant, string> = {
	default: "text-foreground",
	strong: "text-foreground",
	accent: "text-primary",
	live: "text-state-live-fg",
	warning: "text-state-warning-fg",
	danger: "text-state-danger-fg",
};

const pillIconSizeBySize: Record<PillSize, string> = {
	sm: "size-3",
	md: "size-4",
	lg: "size-4",
};

const pillTextSizeBySize: Record<PillSize, string> = {
	sm: "text-xs",
	md: "text-sm",
	lg: "text-sm",
};

export type PillProps = Omit<BadgeProps, "variant"> &
	Omit<PressableProps, keyof BadgeProps> &
	VariantProps<typeof pillVariants> & {
		label: string;
		leadingIcon?: LucideIcon;
		onDismiss?: () => void;
		dismissAccessibilityLabel?: string;
		monospace?: boolean;
		uppercase?: boolean;
		onPress?: PressableProps["onPress"];
	};

/**
 * Chat-domain pill — composes vendor `<Badge>` (already rounded-full) and
 * overrides tinting + sizing via className. Vendor variants don't cover the
 * status palette we need (default/strong/accent/live/warning/danger), so we
 * always pass `variant="outline"` and let our cva handle the visual.
 *
 * For interactive pills (`onPress` provided or `interactive=true`), uses
 * `asChild` + Pressable so the Badge style applies to a real tap surface.
 *
 * Per atom · pill spec: monospace + uppercase modifiers, separate dismiss ✕
 * with its own 14pt hitSlop = 44pt total tap target.
 */
export function Pill({
	label,
	leadingIcon,
	onDismiss,
	dismissAccessibilityLabel,
	variant,
	size,
	selected,
	interactive,
	monospace,
	uppercase,
	className,
	disabled,
	onPress,
	...props
}: PillProps) {
	const resolvedVariant: PillVariant = variant ?? "default";
	const resolvedSize: PillSize = size ?? "md";
	const resolvedInteractive = interactive ?? Boolean(onPress);
	const containerClass = cn(
		// Reset vendor Badge's bg/border to be replaced by our cva variants.
		"border",
		pillVariants({
			variant: resolvedVariant,
			size: resolvedSize,
			selected,
			interactive: resolvedInteractive,
		}),
		disabled && "opacity-50",
		className,
	);
	const textClass = cn(
		pillTextColorByVariant[resolvedVariant],
		pillTextSizeBySize[resolvedSize],
		"font-medium",
		monospace && "font-mono",
		uppercase && "uppercase tracking-wider",
	);
	const iconClass = cn(
		pillIconSizeBySize[resolvedSize],
		pillTextColorByVariant[resolvedVariant],
	);

	const contents = (
		<>
			{leadingIcon ? <Icon as={leadingIcon} className={iconClass} /> : null}
			<Text className={textClass}>{label}</Text>
			{onDismiss ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={dismissAccessibilityLabel ?? `Remove ${label}`}
					onPress={onDismiss}
					hitSlop={14}
					className="active:opacity-70"
					disabled={disabled}
				>
					<Icon
						as={X}
						className={cn("size-3.5", pillTextColorByVariant[resolvedVariant])}
					/>
				</Pressable>
			) : null}
		</>
	);

	if (resolvedInteractive) {
		// asChild swaps Badge's underlying <View> for our <Pressable>, preserving
		// the rounded-full + flex-row layout from vendor Badge.
		return (
			<Badge asChild variant="outline" className={containerClass}>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{
						selected: selected ?? undefined,
						disabled: disabled ?? false,
					}}
					disabled={disabled}
					onPress={onPress}
					{...props}
				>
					{contents}
				</Pressable>
			</Badge>
		);
	}

	return (
		<Badge variant="outline" className={containerClass} {...props}>
			{contents}
		</Badge>
	);
}
