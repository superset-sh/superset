import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function OptionChips<Value extends string | number>({
	title,
	options,
	value,
	onChange,
}: {
	title: string;
	options: ReadonlyArray<{ value: Value; label: string }>;
	value: Value;
	onChange: (value: Value) => void;
}) {
	return (
		<View className="gap-2.5">
			<Text className="text-muted-foreground text-[13px] font-semibold">
				{title}
			</Text>
			<View className="flex-row flex-wrap gap-2">
				{options.map((option) => {
					const selected = option.value === value;
					return (
						<Pressable
							key={option.value}
							accessibilityRole="radio"
							accessibilityState={{ selected }}
							className={cn(
								"rounded-full px-3.5 py-2 active:opacity-70",
								selected ? "bg-primary" : "bg-secondary",
							)}
							onPress={() => {
								if (selected) return;
								void Haptics.selectionAsync();
								onChange(option.value);
							}}
						>
							<Text
								className={cn(
									"text-[15px]",
									selected
										? "text-primary-foreground font-semibold"
										: "text-foreground",
								)}
							>
								{option.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}
