import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function CheckboxShowcase({
	initialChecked,
	disabled,
	label,
}: {
	initialChecked: boolean;
	disabled: boolean;
	label: string;
}) {
	const [checked, setChecked] = useState(initialChecked);
	return (
		<View className="flex-row items-center gap-3">
			<Checkbox
				checked={checked}
				onCheckedChange={setChecked}
				disabled={disabled}
			/>
			<Label disabled={disabled}>{label}</Label>
		</View>
	);
}

const meta: Meta<typeof CheckboxShowcase> = {
	title: "Components/Checkbox",
	component: CheckboxShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Multi-select box. Used in workspace filter rows (UC-NAV-08) and inline markdown task lists.",
			},
		},
	},
	args: {
		initialChecked: false,
		disabled: false,
		label: "main · macbook-pro",
	},
	argTypes: {
		initialChecked: { control: "boolean" },
		disabled: { control: "boolean" },
		label: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof CheckboxShowcase>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { initialChecked: true } };
export const Disabled: Story = {
	args: { disabled: true, label: "main · macbook-pro (offline host)" },
};
