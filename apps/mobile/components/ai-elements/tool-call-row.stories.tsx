import type { Meta, StoryObj } from "@storybook/react-native";
import { SearchIcon, TerminalIcon, WrenchIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { ToolCallRow } from "@/components/ai-elements/tool-call-row";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/ToolCallRow",
	component: ToolCallRow,
	args: {
		icon: TerminalIcon,
		title: "Bash",
	},
} satisfies Meta<typeof ToolCallRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full">
			<ToolCallRow
				description="bun run typecheck"
				icon={TerminalIcon}
				title="Bash"
			/>
		</View>
	),
};

export const Expandable: Story = {
	render: () => (
		<View className="w-full">
			<ToolCallRow
				description="workspace_created in apps/desktop"
				icon={SearchIcon}
				title="Grep"
			>
				<View className="py-1.5 pl-2">
					<Text className="font-mono text-muted-foreground text-xs">
						apps/desktop/src/analytics/events.ts{"\n"}
						apps/desktop/src/main/workspace/create.ts{"\n"}
						apps/desktop/src/renderer/onboarding/OnboardingFlow.tsx
					</Text>
				</View>
			</ToolCallRow>
		</View>
	),
};

export const Pending: Story = {
	render: () => (
		<View className="w-full">
			<ToolCallRow
				description="bunx drizzle-kit generate"
				icon={TerminalIcon}
				isPending
				title="Bash"
			/>
		</View>
	),
};

export const ErrorState: Story = {
	render: () => (
		<View className="w-full">
			<ToolCallRow icon={TerminalIcon} isError title="Bash" />
		</View>
	),
};

export const NotConfigured: Story = {
	render: () => (
		<View className="w-full">
			<ToolCallRow
				description="linear.list_issues"
				icon={WrenchIcon}
				isNotConfigured
				title="MCP"
			/>
		</View>
	),
};

export const WithStatusAndHeaderExtra: Story = {
	render: () => (
		<View className="w-full">
			<ToolCallRow
				description="superset.sh/docs"
				headerExtra={
					<Pressable className="mr-1 rounded px-1 py-0.5">
						<Text className="text-muted-foreground text-xs">Open</Text>
					</Pressable>
				}
				icon={SearchIcon}
				statusNode={
					<Text className="text-muted-foreground text-xs">48.2 KB</Text>
				}
				title="Web Fetch"
			>
				<View className="py-1.5 pl-2">
					<Text className="font-mono text-muted-foreground text-xs">
						# Superset Docs{"\n"}Orchestrate coding agents across devices...
					</Text>
				</View>
			</ToolCallRow>
		</View>
	),
};
