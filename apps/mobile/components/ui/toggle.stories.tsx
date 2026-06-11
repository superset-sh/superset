import type { Meta, StoryObj } from "@storybook/react-native";
import { Bold } from "lucide-react-native";
import { useState } from "react";
import { Text } from "@/components/ui/text";
import { Toggle, ToggleIcon } from "@/components/ui/toggle";

function ToggleShowcase({
	variant,
	withIcon,
	label,
	initialPressed,
}: {
	variant: "default" | "outline";
	withIcon: boolean;
	label: string;
	initialPressed: boolean;
}) {
	const [pressed, setPressed] = useState(initialPressed);
	return (
		<Toggle variant={variant} pressed={pressed} onPressedChange={setPressed}>
			{withIcon ? <ToggleIcon as={Bold} /> : null}
			<Text>{label}</Text>
		</Toggle>
	);
}

const meta: Meta<typeof ToggleShowcase> = {
	title: "Components/Toggle",
	component: ToggleShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Single on/off button. Single-cell variant of ToggleGroup. Useful for icon-style boolean controls (favorite, pin, etc.).",
			},
		},
	},
	args: {
		variant: "default",
		withIcon: false,
		label: "Bold",
		initialPressed: false,
	},
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["default", "outline"],
		},
		withIcon: { control: "boolean" },
		label: { control: "text" },
		initialPressed: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof ToggleShowcase>;

export const Default: Story = {};
export const Pressed: Story = { args: { initialPressed: true } };
export const WithIcon: Story = { args: { withIcon: true } };
export const Outline: Story = { args: { variant: "outline" } };
