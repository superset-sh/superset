import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import type { ChecksFilterValue } from "../../utils/checksFilter";

/** Segmented filter in the sheet's title; a form sheet paints its header over content, so it cannot live in the list. */
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
		<Host matchContents style={{ minWidth: 300 }}>
			<Picker
				modifiers={[pickerStyle("segmented")]}
				onSelectionChange={(selection) =>
					onChange(selection as ChecksFilterValue)
				}
				selection={value}
			>
				{options.map((option) => (
					<Text key={option.value} modifiers={[tag(option.value)]}>
						{`${option.label} ${option.count}`}
					</Text>
				))}
			</Picker>
		</Host>
	);
}
