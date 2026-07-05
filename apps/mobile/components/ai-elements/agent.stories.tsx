import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Agent,
	AgentContent,
	AgentHeader,
	AgentInstructions,
	AgentOutput,
	AgentTool,
	AgentTools,
} from "@/components/ai-elements/agent";

const READ_FILE_TOOL = {
	description: "Read a file from the repository",
	inputSchema: {
		properties: {
			path: { description: "Absolute file path", type: "string" },
			limit: { description: "Max lines to read", type: "number" },
		},
		required: ["path"],
		type: "object",
	},
};

const SEARCH_TOOL = {
	description: "Search the codebase for a pattern",
	jsonSchema: {
		properties: {
			pattern: { type: "string" },
			glob: { type: "string" },
		},
		required: ["pattern"],
		type: "object",
	},
};

const OUTPUT_SCHEMA = `type Review = {
  verdict: "approve" | "request_changes";
  findings: Array<{
    file: string;
    line: number;
    severity: "low" | "medium" | "high";
    message: string;
  }>;
};`;

const meta = {
	title: "ai-elements/Agent",
	component: Agent,
} satisfies Meta<typeof Agent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<Agent>
				<AgentHeader model="claude-sonnet-4-5" name="Code Reviewer" />
				<AgentContent>
					<AgentInstructions>
						Review pull requests for correctness bugs, security issues, and
						adherence to project conventions. Report only high-confidence
						findings.
					</AgentInstructions>
					<AgentTools type="multiple">
						<AgentTool tool={READ_FILE_TOOL} value="read_file" />
						<AgentTool tool={SEARCH_TOOL} value="search" />
					</AgentTools>
					<AgentOutput schema={OUTPUT_SCHEMA} />
				</AgentContent>
			</Agent>
		</View>
	),
};

export const HeaderOnly: Story = {
	render: () => (
		<View className="w-full">
			<Agent>
				<AgentHeader name="Issue Triager" />
			</Agent>
		</View>
	),
};
