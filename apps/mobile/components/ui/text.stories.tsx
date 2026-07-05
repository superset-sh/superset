import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/Text",
	component: Text,
	args: {
		variant: "default",
		children: "The quick brown fox jumps over the lazy dog.",
	},
	argTypes: {
		variant: {
			control: "select",
			options: [
				"default",
				"h1",
				"h2",
				"h3",
				"h4",
				"p",
				"blockquote",
				"code",
				"lead",
				"large",
				"small",
				"muted",
			],
		},
	},
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Heading1: Story = {
	args: { variant: "h1", children: "Heading 1" },
};

export const Lead: Story = {
	args: { variant: "lead", children: "A lead paragraph stands out." },
};

export const Headings: Story = {
	render: () => (
		<View className="gap-2">
			<Text variant="h2">Heading 2</Text>
			<Text variant="h3">Heading 3</Text>
			<Text variant="muted">Muted supporting text.</Text>
		</View>
	),
};
