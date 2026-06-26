import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ToolInterrupted } from "@/components/ai-elements/tool-interrupted";

const meta = {
	title: "ai-elements/ToolInterrupted",
	component: ToolInterrupted,
	args: {
		toolName: "Bash",
	},
} satisfies Meta<typeof ToolInterrupted>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => (
		<View className="w-full">
			<ToolInterrupted {...args} />
		</View>
	),
};

export const WithSubtitle: Story = {
	args: {
		toolName: "Bash",
		subtitle: "bun run build --filter=@superset/desktop",
	},
	render: (args) => (
		<View className="w-full">
			<ToolInterrupted {...args} />
		</View>
	),
};

export const LongSubtitle: Story = {
	args: {
		toolName: "Edit",
		subtitle:
			"apps/desktop/src/renderer/workspaces/components/WorkspaceList/WorkspaceList.tsx",
	},
	render: (args) => (
		<View className="w-full">
			<ToolInterrupted {...args} />
		</View>
	),
};
