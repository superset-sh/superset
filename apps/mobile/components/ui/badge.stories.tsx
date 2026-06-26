import type { Meta, StoryObj } from "@storybook/react-native";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Badge",
	component: Badge,
	args: {
		variant: "default",
	},
	argTypes: {
		variant: {
			control: "select",
			options: ["default", "secondary", "destructive", "outline"],
		},
	},
	render: ({ variant }) => (
		<Badge variant={variant}>
			<Text>Badge</Text>
		</Badge>
	),
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = { args: { variant: "secondary" } };

export const Destructive: Story = { args: { variant: "destructive" } };

export const Outline: Story = { args: { variant: "outline" } };
