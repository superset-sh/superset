import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Text } from "@/components/ui/text";

function RadioGroupShowcase({
	options,
	initialValue,
}: {
	options: { value: string; label: string; meta?: string }[];
	initialValue: string;
}) {
	const [value, setValue] = useState(initialValue);
	return (
		<RadioGroup value={value} onValueChange={setValue} className="gap-3">
			{options.map((opt) => (
				<View key={opt.value} className="flex-row items-start gap-3">
					<RadioGroupItem value={opt.value} aria-labelledby={opt.value} />
					<View className="flex-1 gap-0.5">
						<Label nativeID={opt.value}>{opt.label}</Label>
						{opt.meta ? (
							<Text variant="muted" className="text-xs">
								{opt.meta}
							</Text>
						) : null}
					</View>
				</View>
			))}
		</RadioGroup>
	);
}

const meta: Meta<typeof RadioGroupShowcase> = {
	title: "Components/RadioGroup",
	component: RadioGroupShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Single-select picker. Used for model picker rows (UC-COMP-04), thinking-level rows (UC-COMP-05), permission-mode rows.",
			},
		},
	},
	args: {
		options: [
			{
				value: "low",
				label: "Low",
				meta: "~1K tokens · fastest, less reasoning depth",
			},
			{
				value: "medium",
				label: "Medium",
				meta: "~4K tokens · balanced",
			},
			{
				value: "high",
				label: "High",
				meta: "~12K tokens · deep reasoning, slower",
			},
			{
				value: "xhigh",
				label: "X-High",
				meta: "~32K tokens · maximum reasoning",
			},
		],
		initialValue: "medium",
	},
	argTypes: {
		initialValue: {
			control: { type: "select" },
			options: ["low", "medium", "high", "xhigh"],
		},
	},
};

export default meta;

type Story = StoryObj<typeof RadioGroupShowcase>;

export const ThinkingLevels: Story = {};
