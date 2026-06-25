import type { Meta, StoryObj } from "@storybook/react-native";
import { Alert, View } from "react-native";
import { ShowCode } from "@/components/ai-elements/show-code";

const SHORT_CODE = `export function greet(name: string) {
	return \`Hello, \${name}!\`;
}`;

const LONG_CODE = Array.from(
	{ length: 40 },
	(_, index) => `console.log("line ${index + 1}");`,
).join("\n");

const meta = {
	title: "ai-elements/ShowCode",
	component: ShowCode,
} satisfies Meta<typeof ShowCode>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		code: SHORT_CODE,
		language: "typescript",
	},
	render: (args) => (
		<View className="w-full">
			<ShowCode {...args} />
		</View>
	),
};

export const Truncated: Story = {
	args: {
		code: LONG_CODE,
		language: "javascript",
	},
	render: (args) => (
		<View className="w-full">
			<ShowCode {...args} />
		</View>
	),
};

export const WithFilename: Story = {
	args: {
		code: SHORT_CODE,
		filename: "apps/mobile/lib/greet.ts",
		language: "typescript",
		lineRange: "1–3",
		onOpen: () => Alert.alert("Open file", "apps/mobile/lib/greet.ts"),
	},
	render: (args) => (
		<View className="w-full">
			<ShowCode {...args} />
		</View>
	),
};

export const PlainText: Story = {
	args: {
		code: SHORT_CODE,
		colorize: false,
		language: "typescript",
		showLineNumbers: false,
	},
	render: (args) => (
		<View className="w-full">
			<ShowCode {...args} />
		</View>
	),
};
