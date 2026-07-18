import {
	Context,
	ContextContent,
	ContextContentHeader,
	ContextTrigger,
} from "@superset/ui/ai-elements/context";

interface TerminalContextUsageProps {
	usedTokens: number;
	/** Model id from the agent binding, used to pick the window size. */
	model?: string;
}

/**
 * Context-window sizes by model id pattern. Curated: the catalog and
 * tokenlens don't carry window sizes for current Claude models, and the
 * value only scales the ring — a stale entry shows a conservative percent,
 * never wrong token counts.
 */
const CONTEXT_WINDOWS: Array<{ match: RegExp; tokens: number }> = [
	{ match: /fable|opus-4-[89]|sonnet-5/, tokens: 1_000_000 },
];
const DEFAULT_CONTEXT_WINDOW = 200_000;

function contextWindowFor(model: string | undefined): number {
	if (!model) return DEFAULT_CONTEXT_WINDOW;
	return (
		CONTEXT_WINDOWS.find(({ match }) => match.test(model))?.tokens ??
		DEFAULT_CONTEXT_WINDOW
	);
}

/**
 * Circular context-usage indicator for the terminal composer. Usage comes
 * from the agent binding (host-service reads the session transcript on each
 * hook event), so it refreshes as turns complete rather than live-streaming.
 */
export function TerminalContextUsage({
	usedTokens,
	model,
}: TerminalContextUsageProps) {
	return (
		<Context usedTokens={usedTokens} maxTokens={contextWindowFor(model)}>
			<ContextTrigger className="h-[23px] gap-1 rounded-md px-1.5 text-xs" />
			<ContextContent side="top" align="end">
				<ContextContentHeader />
			</ContextContent>
		</Context>
	);
}
