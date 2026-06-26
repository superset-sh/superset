import type { Meta, StoryObj } from "@storybook/react-native";
import * as React from "react";
import { View } from "react-native";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const meta = {
	title: "ui/RadioGroup",
	component: RadioGroup,
	args: {
		value: "comfortable",
		onValueChange: () => {},
	},
	render: () => {
		const [value, setValue] = React.useState("comfortable");
		return (
			<RadioGroup value={value} onValueChange={setValue}>
				<View className="flex-row items-center gap-2">
					<RadioGroupItem value="default" />
					<Label onPress={() => setValue("default")}>Default</Label>
				</View>
				<View className="flex-row items-center gap-2">
					<RadioGroupItem value="comfortable" />
					<Label onPress={() => setValue("comfortable")}>Comfortable</Label>
				</View>
				<View className="flex-row items-center gap-2">
					<RadioGroupItem value="compact" />
					<Label onPress={() => setValue("compact")}>Compact</Label>
				</View>
			</RadioGroup>
		);
	},
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
