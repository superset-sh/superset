import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@/components/ai-elements/tool";

const TOOL_INPUT = {
	query: "stick-to-bottom scroll behavior",
	limit: 5,
};

const TOOL_OUTPUT = {
	results: [
		{ title: "conversation.tsx", score: 0.92 },
		{ title: "use-stick-to-bottom.ts", score: 0.87 },
	],
};

const meta = {
	title: "ai-elements/Tool",
	component: Tool,
} satisfies Meta<typeof Tool>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InputStreaming: Story = {
	render: () => (
		<View className="w-full">
			<Tool>
				<ToolHeader state="input-streaming" type="tool-codebase_search" />
				<ToolContent>
					<ToolInput input={TOOL_INPUT} />
				</ToolContent>
			</Tool>
		</View>
	),
};

export const Running: Story = {
	render: () => (
		<View className="w-full">
			<Tool defaultOpen>
				<ToolHeader state="input-available" type="tool-codebase_search" />
				<ToolContent>
					<ToolInput input={TOOL_INPUT} />
				</ToolContent>
			</Tool>
		</View>
	),
};

export const OutputAvailable: Story = {
	render: () => (
		<View className="w-full">
			<Tool defaultOpen>
				<ToolHeader state="output-available" type="tool-codebase_search" />
				<ToolContent>
					<ToolInput input={TOOL_INPUT} />
					<ToolOutput errorText={undefined} output={TOOL_OUTPUT} />
				</ToolContent>
			</Tool>
		</View>
	),
};

export const OutputError: Story = {
	render: () => (
		<View className="w-full">
			<Tool defaultOpen>
				<ToolHeader state="output-error" type="tool-codebase_search" />
				<ToolContent>
					<ToolInput input={TOOL_INPUT} />
					<ToolOutput
						errorText="Search index is unavailable"
						output={undefined}
					/>
				</ToolContent>
			</Tool>
		</View>
	),
};

export const DynamicTool: Story = {
	render: () => (
		<View className="w-full">
			<Tool>
				<ToolHeader
					state="output-available"
					toolName="generate_image"
					type="dynamic-tool"
				/>
			</Tool>
		</View>
	),
};
