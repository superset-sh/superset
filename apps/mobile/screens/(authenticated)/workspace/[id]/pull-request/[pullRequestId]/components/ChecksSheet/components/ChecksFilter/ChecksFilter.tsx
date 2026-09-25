import { Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import type { ChecksFilterValue } from "../../utils/checksFilter";

/** The sheet's filter row; segments scroll rather than compress. */
export function ChecksFilter({
	value,
	onChange,
	options,
}: {
	value: ChecksFilterValue;
	onChange: (value: ChecksFilterValue) => void;
	options: { value: ChecksFilterValue; label: string; count: number }[];
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			// pl-1 + the pill's px-3 lands the first tab's text on the same
			// 16px gutter as the rows below it.
			contentContainerClassName="flex-row items-center gap-1 pl-1 pr-4"
		>
			{options.map((option) => {
				const isSelected = option.value === value;
				return (
					<Pressable
						accessibilityLabel={`${option.label} ${option.count}`}
						accessibilityRole="tab"
						accessibilityState={{ selected: isSelected }}
						className={`rounded-full px-3 py-1.5 ${isSelected ? "bg-secondary" : ""}`}
						key={option.value}
						onPress={() => onChange(option.value)}
					>
						<Text
							className={`text-[15px] ${isSelected ? "text-foreground" : "text-muted-foreground"}`}
						>
							{option.label}{" "}
							<Text
								className={`text-[15px] ${isSelected ? "text-foreground/50" : "text-muted-foreground/60"}`}
							>
								{option.count}
							</Text>
						</Text>
					</Pressable>
				);
			})}
		</ScrollView>
	);
}
