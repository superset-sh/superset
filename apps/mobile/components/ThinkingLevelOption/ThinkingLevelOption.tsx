import { Pressable, type PressableProps } from "react-native";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ThinkingLevelOptionKind = "thinking" | "permission";

export type ThinkingLevelOptionProps = PressableProps & {
	value: string;
	label: string;
	/** Right-aligned hint: token budget (~1K tokens) or mode note (Ask for risky ops). */
	hint?: string;
	/** Kind — `thinking` (default) or `permission`. Reserved for future per-kind styling. */
	kind?: ThinkingLevelOptionKind;
	isSelected?: boolean;
};

/**
 * Single row in the thinking-level / permission-mode picker popover.
 *
 * Per mol-thinking-level-option spec:
 *  - 44pt min-height; tap anywhere selects the radio
 *  - Hint text (~1K tokens / Ask for risky ops) is included in
 *    accessibilityLabel so screen readers hear it
 *  - kind reserved for future per-kind styling (warning on bypassPermissions)
 *
 * Must be rendered inside a vendor <RadioGroup>.
 * Composes vendor RadioGroupItem + Text.
 */
export function ThinkingLevelOption({
	value,
	label,
	hint,
	kind = "thinking",
	isSelected,
	disabled,
	className,
	...props
}: ThinkingLevelOptionProps) {
	const accessibilityLabel = hint ? `${label} — ${hint}` : label;
	return (
		<Pressable
			accessibilityRole="radio"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{
				selected: isSelected ?? false,
				disabled: disabled ?? false,
			}}
			disabled={disabled}
			className={cn(
				"flex-row items-center min-h-touch-min gap-3 px-4 py-3 rounded-md active:opacity-70",
				isSelected && "bg-accent",
				disabled && "opacity-50",
				className,
			)}
			data-kind={kind}
			{...props}
		>
			<RadioGroupItem value={value} aria-label={accessibilityLabel} />
			<Text className="flex-1 font-medium text-foreground">{label}</Text>
			{hint ? (
				<Text className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
					{hint}
				</Text>
			) : null}
		</Pressable>
	);
}
