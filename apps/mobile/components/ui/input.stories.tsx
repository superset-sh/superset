import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function InputShowcase({
	placeholder,
	editable,
	initialValue,
	showLabel,
}: {
	placeholder: string;
	editable: boolean;
	initialValue: string;
	showLabel: boolean;
}) {
	const [value, setValue] = useState(initialValue);
	return (
		<View className="gap-2 w-full">
			{showLabel ? <Label>Search sessions</Label> : null}
			<Input
				value={value}
				onChangeText={setValue}
				placeholder={placeholder}
				editable={editable}
			/>
		</View>
	);
}

const meta: Meta<typeof InputShowcase> = {
	title: "Components/Input",
	component: InputShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Single-line text input. Used by SessionSearchBar (UC-NAV-07), plan-review feedback field (UC-PAUSE-03).",
			},
		},
	},
	args: {
		placeholder: "Search this project's sessions",
		editable: true,
		initialValue: "",
		showLabel: false,
	},
	argTypes: {
		placeholder: { control: "text" },
		editable: { control: "boolean" },
		initialValue: { control: "text" },
		showLabel: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof InputShowcase>;

export const Empty: Story = {};

export const WithValue: Story = {
	args: { initialValue: "host-service refactor" },
};

export const WithLabel: Story = { args: { showLabel: true } };

export const Disabled: Story = {
	args: { editable: false, initialValue: "Cannot edit" },
};

export const FeedbackField: Story = {
	args: {
		showLabel: true,
		placeholder: "Add feedback...",
		initialValue: "",
	},
	parameters: {
		docs: {
			description: {
				story: "Plan-review feedback input (UC-PAUSE-03).",
			},
		},
	},
};
