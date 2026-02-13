import type { DurableChatCollections } from "@superset/durable-session/react";
import {
	Context,
	ContextContent,
	ContextContentBody,
	ContextContentFooter,
	ContextContentHeader,
	ContextInputUsage,
	ContextOutputUsage,
	ContextTrigger,
} from "@superset/ui/ai-elements/context";
import { useLiveQuery } from "@tanstack/react-db";

const MAX_TOKENS = 200_000;

interface ContextIndicatorProps {
	collections: DurableChatCollections;
	modelId: string;
}

export function ContextIndicator({
	collections,
	modelId,
}: ContextIndicatorProps) {
	const { data: statsRows } = useLiveQuery((q) =>
		q.from({ s: collections.sessionStats }).select(({ s }) => ({ ...s })),
	);

	const stats = statsRows?.[0];
	const usedTokens = stats?.totalTokens ?? 0;
	const usage = {
		inputTokens: stats?.promptTokens ?? 0,
		outputTokens: stats?.completionTokens ?? 0,
		totalTokens: stats?.totalTokens ?? 0,
	};

	return (
		<Context
			maxTokens={MAX_TOKENS}
			modelId={modelId}
			usage={usage}
			usedTokens={usedTokens}
		>
			<ContextTrigger />
			<ContextContent>
				<ContextContentHeader />
				<ContextContentBody>
					<div className="space-y-1">
						<ContextInputUsage />
						<ContextOutputUsage />
					</div>
				</ContextContentBody>
				<ContextContentFooter />
			</ContextContent>
		</Context>
	);
}
