import { cva, type VariantProps } from "class-variance-authority";
import { Pressable, type PressableProps, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const modelPickerOptionVariants = cva(
	"flex-row items-center min-h-touch-min gap-3 px-4 py-3 rounded-md active:opacity-70",
	{
		variants: {
			variant: {
				default: "",
				featured: "",
			},
			isSelected: {
				true: "",
				false: "",
			},
		},
		compoundVariants: [
			{
				variant: "default",
				isSelected: true,
				className: "bg-accent",
			},
			{
				variant: "featured",
				isSelected: true,
				className: "bg-primary/15",
			},
		],
		defaultVariants: {
			variant: "default",
			isSelected: false,
		},
	},
);

export type ModelPickerOptionProps = PressableProps &
	VariantProps<typeof modelPickerOptionVariants> & {
		/** RadioGroupItem `value` — must be unique within the parent RadioGroup. */
		value: string;
		/** Model display name. */
		label: string;
		/** Show a "NEW" badge after the label. */
		isNew?: boolean;
	};

/**
 * Single selectable row inside the model-picker popover.
 *
 * Per mol-model-picker-option spec:
 *  - 2 variants: default (accent bg when selected) · featured (ember-tinted)
 *  - 44pt min-height; tap anywhere selects the radio
 *  - isNew → trailing "NEW" Badge
 *  - Must be rendered inside a vendor <RadioGroup> with matching value prop.
 *
 * Composes vendor RadioGroupItem + Badge + Text.
 */
export function ModelPickerOption({
	value,
	label,
	isNew,
	variant,
	isSelected,
	className,
	disabled,
	...props
}: ModelPickerOptionProps) {
	return (
		<Pressable
			accessibilityRole="radio"
			accessibilityLabel={label}
			accessibilityState={{
				selected: isSelected ?? false,
				disabled: disabled ?? false,
			}}
			disabled={disabled}
			className={cn(
				modelPickerOptionVariants({ variant, isSelected }),
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			<RadioGroupItem value={value} aria-label={label} />
			<View className="flex-1 flex-row items-center gap-2">
				<Text className="flex-1 font-medium text-foreground" numberOfLines={1}>
					{label}
				</Text>
				{isNew ? (
					<Badge variant="default" className="px-1.5 py-0">
						<Text className="text-[10px] font-mono uppercase tracking-wider text-primary-foreground">
							NEW
						</Text>
					</Badge>
				) : null}
			</View>
		</Pressable>
	);
}
