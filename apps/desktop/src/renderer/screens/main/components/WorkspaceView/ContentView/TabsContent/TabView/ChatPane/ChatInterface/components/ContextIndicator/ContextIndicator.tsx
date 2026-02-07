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
} from "@superset/ui/ai-elements/context";

const MOCK_CONTEXT = {
	usedTokens: 84_200,
	maxTokens: 200_000,
	modelId: "claude-sonnet-4-5-20250929",
	usage: {
		inputTokens: 42_100,
		outputTokens: 18_300,
		totalTokens: 84_200,
		reasoningTokens: 12_800,
		cachedInputTokens: 11_000,
	},
} as const;

export function ContextIndicator() {
	return (
		<Context
			maxTokens={MOCK_CONTEXT.maxTokens}
			modelId={MOCK_CONTEXT.modelId}
			usage={MOCK_CONTEXT.usage}
			usedTokens={MOCK_CONTEXT.usedTokens}
		>
			<ContextTrigger />
			<ContextContent>
				<ContextContentHeader />
				<ContextContentBody>
					<div className="space-y-1">
						<ContextInputUsage />
						<ContextOutputUsage />
						<ContextReasoningUsage />
						<ContextCacheUsage />
					</div>
				</ContextContentBody>
				<ContextContentFooter />
			</ContextContent>
		</Context>
	);
}
