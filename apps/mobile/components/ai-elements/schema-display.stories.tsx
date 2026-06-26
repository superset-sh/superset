import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SchemaDisplay } from "@/components/ai-elements/schema-display";

const PARAMETERS = [
	{
		description: "The workspace to create the session in.",
		location: "path" as const,
		name: "workspaceId",
		required: true,
		type: "string",
	},
	{
		description: "Maximum number of results to return.",
		location: "query" as const,
		name: "limit",
		type: "number",
	},
];

const REQUEST_BODY = [
	{
		description: "The agent to start the session with.",
		name: "agent",
		required: true,
		type: "string",
	},
	{
		name: "options",
		properties: [
			{ name: "model", type: "string" },
			{ name: "maxTurns", type: "number" },
			{
				name: "tools",
				properties: [
					{ name: "name", required: true, type: "string" },
					{ name: "enabled", type: "boolean" },
				],
				type: "object[]",
			},
		],
		type: "object",
	},
];

const RESPONSE_BODY = [
	{ name: "sessionId", required: true, type: "string" },
	{ name: "status", required: true, type: '"queued" | "running"' },
	{
		items: { name: "warning", type: "string" },
		name: "warnings",
		type: "string[]",
	},
];

const meta = {
	title: "ai-elements/SchemaDisplay",
	component: SchemaDisplay,
} satisfies Meta<typeof SchemaDisplay>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		description: "Start a new agent session inside a workspace.",
		method: "POST",
		parameters: PARAMETERS,
		path: "/v1/workspaces/{workspaceId}/sessions",
		requestBody: REQUEST_BODY,
		responseBody: RESPONSE_BODY,
	},
	render: (args) => (
		<View className="w-full">
			<SchemaDisplay {...args} />
		</View>
	),
};

export const GetEndpoint: Story = {
	args: {
		description: "Fetch a single workspace by id.",
		method: "GET",
		parameters: [
			{
				location: "path" as const,
				name: "workspaceId",
				required: true,
				type: "string",
			},
		],
		path: "/v1/workspaces/{workspaceId}",
		responseBody: [
			{ name: "id", required: true, type: "string" },
			{ name: "name", required: true, type: "string" },
			{ name: "createdAt", type: "string" },
		],
	},
	render: (args) => (
		<View className="w-full">
			<SchemaDisplay {...args} />
		</View>
	),
};

export const DeleteEndpoint: Story = {
	args: {
		method: "DELETE",
		parameters: [
			{
				location: "path" as const,
				name: "sessionId",
				required: true,
				type: "string",
			},
		],
		path: "/v1/sessions/{sessionId}",
	},
	render: (args) => (
		<View className="w-full">
			<SchemaDisplay {...args} />
		</View>
	),
};
