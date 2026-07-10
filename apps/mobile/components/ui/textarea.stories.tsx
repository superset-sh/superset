import type { Meta, StoryObj } from "@storybook/react-native";
import { Textarea } from "@/components/ui/textarea";

const meta = {
	title: "ui/Textarea",
	component: Textarea,
	args: {
		placeholder: "Type your message here.",
	},
	render: (args) => <Textarea className="w-64" {...args} />,
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
	args: { value: "Hello, this is a multi-line message in the textarea." },
};

export const Disabled: Story = {
	args: { editable: false, value: "Disabled textarea" },
};
