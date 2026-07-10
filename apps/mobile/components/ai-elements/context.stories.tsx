import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Context,
	ContextCacheUsage,
	ContextContent,
	ContextContentBody,
	ContextContentFooter,
	ContextContentHeader,
	ContextInputUsage,
	ContextOutputUsage,
	ContextReasoningUsage,
	ContextTrigger,
} from "@/components/ai-elements/context";

const meta = {
	title: "ai-elements/Context",
	component: Context,
	args: {
		maxTokens: 200_000,
		usedTokens: 64_000,
	},
} satisfies Meta<typeof Context>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => (
		<View className="w-full items-start">
			<Context
				maxTokens={200_000}
				modelId="openai:gpt-4o"
				usage={{
					cachedInputTokens: 16_000,
					inputTokens: 44_000,
					outputTokens: 12_000,
					reasoningTokens: 8_000,
				}}
				usedTokens={64_000}
			>
				<ContextTrigger />
				<ContextContent>
					<ContextContentHeader />
					<ContextContentBody>
						<View className="gap-2">
							<ContextInputUsage />
							<ContextOutputUsage />
							<ContextReasoningUsage />
							<ContextCacheUsage />
						</View>
					</ContextContentBody>
					<ContextContentFooter />
				</ContextContent>
			</Context>
		</View>
	),
};

export const NearlyFull: Story = {
	render: () => (
		<View className="w-full items-start">
			<Context maxTokens={200_000} usedTokens={188_000}>
				<ContextTrigger />
				<ContextContent>
					<ContextContentHeader />
				</ContextContent>
			</Context>
		</View>
	),
};
