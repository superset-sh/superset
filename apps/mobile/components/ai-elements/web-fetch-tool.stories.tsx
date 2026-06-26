import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { WebFetchTool } from "@/components/ai-elements/web-fetch-tool";

const FETCHED_CONTENT = `# Workspaces

Superset workspaces are isolated git worktrees. Each workspace gets:

- Its own branch, checked out from the repo default branch
- An isolated working directory under ~/.superset/worktrees
- A dedicated terminal session wired to the host service

## Creating a workspace

Run \`superset workspace create --task "Fix the relay memory leak"\`
or use the desktop app's New Workspace flow.`;

const LONG_CONTENT = Array.from(
	{ length: 50 },
	(_, i) => `Line ${i + 1} of the fetched page body...`,
).join("\n");

const meta = {
	title: "ai-elements/WebFetchTool",
	component: WebFetchTool,
	args: {
		url: "https://superset.sh/docs/workspaces",
		state: "output-available",
	},
} satisfies Meta<typeof WebFetchTool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		bytes: 48213,
		content: FETCHED_CONTENT,
		statusCode: 200,
	},
	render: (args) => (
		<View className="w-full">
			<WebFetchTool {...args} />
		</View>
	),
};

export const Fetching: Story = {
	args: {
		state: "input-available",
	},
	render: (args) => (
		<View className="w-full">
			<WebFetchTool {...args} />
		</View>
	),
};

export const NotFound: Story = {
	args: {
		statusCode: 404,
		url: "https://superset.sh/docs/does-not-exist",
	},
	render: (args) => (
		<View className="w-full">
			<WebFetchTool {...args} />
		</View>
	),
};

export const Failed: Story = {
	args: {
		state: "output-error",
		url: "https://internal.superset.sh/metrics",
	},
	render: (args) => (
		<View className="w-full">
			<WebFetchTool {...args} />
		</View>
	),
};

export const LongContent: Story = {
	args: {
		bytes: 1024 * 1024 * 1.4,
		content: LONG_CONTENT,
		statusCode: 200,
	},
	render: (args) => (
		<View className="w-full">
			<WebFetchTool {...args} />
		</View>
	),
};
