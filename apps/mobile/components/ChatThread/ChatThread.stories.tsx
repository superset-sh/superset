import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ChatThread, type ChatThreadItem } from "./ChatThread";

const STREAMING_CONVERSATION: ChatThreadItem[] = [
	{
		id: "u1",
		kind: "user",
		message:
			"Refactor the relay tunnel reconnect loop to use exponential backoff.",
		timestamp: "10:24 AM",
	},
	{
		id: "a1-head",
		kind: "assistant-head",
		timestamp: "10:24 AM",
		variant: "completed",
		completedDuration: "· 3.2s",
	},
	{
		id: "a1-body",
		kind: "assistant-body",
		body: (
			<Text className="text-foreground">
				I'll refactor the reconnect loop to use exponential backoff with jitter.
				Reading the current implementation first.
			</Text>
		),
	},
	{
		id: "t1",
		kind: "tool-call",
		name: "read_file",
		args: "packages/relay/src/tunnel.ts",
		status: "done",
		duration: "0.4s",
	},
	{
		id: "t2",
		kind: "tool-call",
		name: "edit_file",
		args: "tunnel.ts — replace reconnect with exponentialBackoff",
		status: "running",
	},
	{
		id: "a2-head",
		kind: "assistant-head",
		timestamp: "10:25 AM",
		variant: "streaming",
	},
	{
		id: "a2-body",
		kind: "assistant-body",
		body: (
			<Text className="text-foreground">
				Now wiring up the new helper and running the test suite to verify…
			</Text>
		),
	},
];

const WITH_PLAN: ChatThreadItem[] = [
	...STREAMING_CONVERSATION.slice(0, 3),
	{
		id: "plan-1",
		kind: "collapsed-block",
		blockKind: "plan",
		meta: "4 steps",
		defaultOpen: true,
		children: (
			<Text className="text-muted-foreground">
				1. Read tunnel.ts{"\n"}2. Identify reconnect call site{"\n"}3. Replace
				with exponentialBackoff helper{"\n"}4. Add jitter to retry delays
			</Text>
		),
	},
	...STREAMING_CONVERSATION.slice(3),
];

const FAILED_MESSAGE: ChatThreadItem[] = [
	{
		id: "u-fail",
		kind: "user",
		message: "Run the deployment now.",
		timestamp: "10:31 AM",
		failed: true,
	},
];

const meta: Meta<typeof ChatThread> = {
	title: "Organisms/ChatThread",
	component: ChatThread,
	parameters: {
		docs: {
			description: {
				component:
					"Scrollable message thread. Renders a typed item list (user · assistant-head · assistant-body · tool-call · collapsed-block) via composed molecules. UC-RENDER-01..06. The CANONICAL HERO of the chat view.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: {
		items: STREAMING_CONVERSATION,
	},
	argTypes: {
		items: { control: false },
	},
};

export default meta;

type Story = StoryObj<typeof ChatThread>;

export const StreamingConversation: Story = {};

export const WithPlanBlock: Story = { args: { items: WITH_PLAN } };

export const FailedUserMessage: Story = { args: { items: FAILED_MESSAGE } };

export const Empty: Story = { args: { items: [] } };
