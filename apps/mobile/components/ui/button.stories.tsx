import type { Meta, StoryObj } from "@storybook/react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Button",
	component: Button,
	args: {
		variant: "default",
		size: "default",
	},
	argTypes: {
		variant: {
			control: "select",
			options: [
				"default",
				"destructive",
				"outline",
				"secondary",
				"ghost",
				"link",
			],
		},
		size: {
			control: "select",
			options: ["default", "sm", "lg", "icon"],
		},
	},
	render: ({ variant, size }) => (
		<Button variant={variant} size={size}>
			<Text>Button</Text>
		</Button>
	),
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = { args: { variant: "destructive" } };

export const Outline: Story = { args: { variant: "outline" } };

export const Secondary: Story = { args: { variant: "secondary" } };
