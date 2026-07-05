import type { Meta, StoryObj } from "@storybook/react-native";
import { Input } from "@/components/ui/input";

const meta = {
	title: "ui/Input",
	component: Input,
	args: {
		placeholder: "Email",
	},
	render: (args) => <Input className="w-64" {...args} />,
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = { args: { value: "hello@example.com" } };

export const Disabled: Story = {
	args: { editable: false, value: "Disabled" },
};
