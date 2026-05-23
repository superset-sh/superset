import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Label } from "@/components/ui/label";

function LabelShowcase({
	text,
	disabled,
}: {
	text: string;
	disabled: boolean;
}) {
	return (
		<View className="gap-2">
			<Label disabled={disabled}>{text}</Label>
		</View>
	);
}

const meta: Meta<typeof LabelShowcase> = {
	title: "Components/Label",
	component: LabelShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Form-control label — typically pairs with an Input, Switch, RadioGroup, or Checkbox. Reads --color-foreground with disabled opacity treatment.",
			},
		},
	},
	args: {
		text: "Workspace name",
		disabled: false,
	},
	argTypes: {
		text: { control: "text" },
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof LabelShowcase>;

export const Default: Story = {};
export const Disabled: Story = {
	args: { disabled: true, text: "Workspace (locked)" },
};
