import { cva, type VariantProps } from "class-variance-authority";
import {
	ChevronDown,
	type LucideIcon,
	Shield,
	Sparkles,
	Zap,
} from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const pickerTriggerVariants = cva(
	"flex-row items-center gap-1.5 rounded-full border border-border bg-card active:opacity-70",
	{
		variants: {
			size: {
				sm: "h-5 px-2",
				md: "h-7 px-3",
			},
			isOpen: {
				true: "bg-accent",
				false: "",
			},
		},
		defaultVariants: {
			size: "md",
			isOpen: false,
		},
	},
);

export type PickerTriggerKind = "model" | "thinking" | "permission";

type KindConfig = {
	icon: LucideIcon;
	prefix?: string;
	ariaPrefix: string;
};

const KIND_CONFIG: Record<PickerTriggerKind, KindConfig> = {
	model: { icon: Sparkles, ariaPrefix: "Model picker" },
	thinking: { icon: Zap, prefix: "Thinking:", ariaPrefix: "Thinking level" },
	permission: {
		icon: Shield,
		prefix: "Permission:",
		ariaPrefix: "Permission mode",
	},
};

export type PickerTriggerProps = PressableProps &
	VariantProps<typeof pickerTriggerVariants> & {
		kind?: PickerTriggerKind;
		value: string;
		/** Override the leading icon (otherwise resolved from `kind`). */
		icon?: LucideIcon;
		/** Override the prefix label (otherwise resolved from `kind`). */
		prefix?: string;
	};

/**
 * Pill-shaped trigger button that opens a picker popover. Used by the composer
 * toolbar for model, thinking-level, and permission-mode selection.
 *
 * Per mol-picker-trigger spec:
 *  - kinds: model (sparkles, no prefix) · thinking (zap, "Thinking:") · permission (shield, "Permission:")
 *  - sizes: sm (20pt) · md (28pt, default, touch-friendly with parent tap area)
 *  - is-open swaps background to accent + rotates chevron 180° (rotation handled by caller via prop if animated)
 *
 * Anatomy: leading icon (xs muted) + optional prefix label (mono small muted)
 * + value (body) + trailing chevron-down (xs faint).
 */
export function PickerTrigger({
	kind = "model",
	value,
	icon,
	prefix,
	size,
	isOpen,
	disabled,
	className,
	...props
}: PickerTriggerProps) {
	const config = KIND_CONFIG[kind];
	const resolvedIcon = icon ?? config.icon;
	const resolvedPrefix = prefix ?? config.prefix;
	const resolvedSize = size ?? "md";

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${config.ariaPrefix} — ${value} selected`}
			accessibilityState={{
				expanded: isOpen ?? false,
				disabled: disabled ?? false,
			}}
			disabled={disabled}
			className={cn(
				pickerTriggerVariants({ size: resolvedSize, isOpen }),
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			<Icon as={resolvedIcon} className="size-3 text-muted-foreground" />
			{resolvedPrefix ? (
				<Text
					className={cn(
						"font-mono text-muted-foreground",
						resolvedSize === "sm" ? "text-[10px]" : "text-xs",
					)}
				>
					{resolvedPrefix}
				</Text>
			) : null}
			<Text
				className={cn(
					"font-medium text-foreground",
					resolvedSize === "sm" ? "text-xs" : "text-sm",
				)}
			>
				{value}
			</Text>
			<View
				className={cn(
					"transition-transform",
					isOpen ? "rotate-180" : "rotate-0",
				)}
			>
				<Icon as={ChevronDown} className="size-3 text-muted-foreground/70" />
			</View>
		</Pressable>
	);
}
