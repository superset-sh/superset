import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { WebSearchTool } from "@/components/ai-elements/web-search-tool";

const RESULTS = [
	{
		title: "TanStack DB — Live Queries",
		url: "https://tanstack.com/db/latest/docs/live-queries",
	},
	{
		title: "ElectricSQL: Postgres sync for local-first apps",
		url: "https://electric-sql.com/docs/intro",
	},
	{
		title: "Superset — Orchestrate coding agents",
		url: "https://superset.sh/docs/workspaces",
	},
	{
		title: "Drizzle ORM - next gen TypeScript ORM",
		url: "https://orm.drizzle.team/docs/overview",
	},
];

const meta = {
	title: "ai-elements/WebSearchTool",
	component: WebSearchTool,
	args: {
		query: "tanstack db live queries cache-first rendering",
		results: RESULTS,
		state: "output-available",
	},
} satisfies Meta<typeof WebSearchTool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => (
		<View className="w-full">
			<WebSearchTool {...args} />
		</View>
	),
};

export const Searching: Story = {
	args: {
		results: [],
		state: "input-available",
	},
	render: (args) => (
		<View className="w-full">
			<WebSearchTool {...args} />
		</View>
	),
};

export const Failed: Story = {
	args: {
		results: [],
		state: "output-error",
	},
	render: (args) => (
		<View className="w-full">
			<WebSearchTool {...args} />
		</View>
	),
};

export const NoResults: Story = {
	args: {
		query: "superset workspace txid wait electric localstorage",
		results: [],
		state: "output-available",
	},
	render: (args) => (
		<View className="w-full">
			<WebSearchTool {...args} />
		</View>
	),
};
