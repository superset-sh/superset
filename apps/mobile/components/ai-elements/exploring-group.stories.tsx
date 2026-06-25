import type { Meta, StoryObj } from "@storybook/react-native";
import { FileIcon, FolderSearchIcon, SearchIcon } from "lucide-react-native";
import { View } from "react-native";
import {
	ExploringGroup,
	type ExploringGroupItem,
} from "@/components/ai-elements/exploring-group";

const ITEMS: ExploringGroupItem[] = [
	{
		icon: SearchIcon,
		title: "Grep",
		subtitle: "useLiveQuery in apps/desktop/src",
		isPending: false,
		isError: false,
	},
	{
		icon: FileIcon,
		title: "Read",
		subtitle: "apps/desktop/src/collections/workspaces.ts",
		isPending: false,
		isError: false,
	},
	{
		icon: FolderSearchIcon,
		title: "Glob",
		subtitle: "**/workspace*.tsx",
		isPending: false,
		isError: false,
	},
	{
		icon: FileIcon,
		title: "Read",
		subtitle: "packages/trpc/src/router/workspace.ts",
		isPending: false,
		isError: false,
	},
];

const STREAMING_ITEMS: ExploringGroupItem[] = [
	...ITEMS,
	{
		icon: FileIcon,
		title: "Read",
		subtitle: "packages/db/src/schema/workspaces.ts",
		isPending: false,
		isError: false,
	},
	{
		icon: FileIcon,
		title: "Read",
		subtitle: "apps/desktop/src/renderer/workspaces/WorkspaceScreen.tsx",
		isPending: false,
		isError: false,
	},
	{
		icon: SearchIcon,
		title: "Grep",
		subtitle: "isReady in apps/desktop/src/renderer",
		isPending: true,
		isError: false,
	},
];

const meta = {
	title: "ai-elements/ExploringGroup",
	component: ExploringGroup,
	args: {
		items: ITEMS,
		isStreaming: false,
	},
} satisfies Meta<typeof ExploringGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Explored: Story = {
	render: (args) => (
		<View className="w-full">
			<ExploringGroup {...args} />
		</View>
	),
};

export const Streaming: Story = {
	args: {
		items: STREAMING_ITEMS,
		isStreaming: true,
	},
	render: (args) => (
		<View className="w-full">
			<ExploringGroup {...args} />
		</View>
	),
};

export const WithError: Story = {
	args: {
		items: [
			...ITEMS,
			{
				icon: SearchIcon,
				title: "Grep",
				subtitle: "pattern not found in packages/mcp",
				isPending: false,
				isError: true,
			},
		],
	},
	render: (args) => (
		<View className="w-full">
			<ExploringGroup {...args} />
		</View>
	),
};
