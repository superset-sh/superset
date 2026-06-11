import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function SwitchShowcase({
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
			<Switch
				checked={checked}
				onCheckedChange={setChecked}
				disabled={disabled}
			/>
			<Label disabled={disabled}>{label}</Label>
		</View>
	);
}

const meta: Meta<typeof SwitchShowcase> = {
	title: "Components/Switch",
	component: SwitchShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Boolean toggle. Used in settings rows (Re-enable in Settings, notification preferences). Thumb translates 14px on check; bg flips to --color-primary (ember) when on.",
			},
		},
	},
	args: {
		initialChecked: false,
		disabled: false,
		label: "Push notifications",
	},
	argTypes: {
		initialChecked: { control: "boolean" },
		disabled: { control: "boolean" },
		label: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof SwitchShowcase>;

export const Off: Story = {};
export const On: Story = { args: { initialChecked: true } };
export const DisabledOff: Story = {
	args: { disabled: true, label: "Notifications (locked by admin)" },
};
export const DisabledOn: Story = {
	args: { disabled: true, initialChecked: true, label: "Always pinned" },
};
