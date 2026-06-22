import type { Meta, StoryObj } from "@storybook/react-native";
import { FileIcon, SearchIcon } from "lucide-react-native";
import { View } from "react-native";
import { ToolCall } from "@/components/ai-elements/tool-call";

const meta = {
	title: "ai-elements/ToolCall",
	component: ToolCall,
	args: {
		icon: FileIcon,
		title: "Read",
		subtitle: "apps/mobile/components/ai-elements/tool.tsx",
		isPending: false,
		isError: false,
	},
} satisfies Meta<typeof ToolCall>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => (
		<View className="w-full">
			<ToolCall {...args} />
		</View>
	),
};

export const Pending: Story = {
	args: {
		icon: SearchIcon,
		title: "Grep",
		subtitle: "useLiveQuery in apps/desktop/src",
		isPending: true,
	},
	render: (args) => (
		<View className="w-full">
			<ToolCall {...args} />
		</View>
	),
};

export const WithPressableSubtitle: Story = {
	args: {
		subtitle: "packages/trpc/src/router/workspace.ts",
		onClick: () => {},
	},
	render: (args) => (
		<View className="w-full">
			<ToolCall {...args} />
		</View>
	),
};

export const ErrorState: Story = {
	args: {
		icon: SearchIcon,
		title: "Glob",
		subtitle: "**/*.test.ts",
		isError: true,
	},
	render: (args) => (
		<View className="w-full">
			<ToolCall {...args} />
		</View>
	),
};
