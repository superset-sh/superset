import { Trans } from "@lingui/react/macro";
import type { ToolContent } from "@superset/chat/protocol";
import { Badge } from "@superset/ui/badge";

const MAX_OUTPUT_CHARS = 20_000;

type TerminalToolContent = Extract<ToolContent, { type: "terminal" }>;

export function TerminalContent({ content }: { content: TerminalToolContent }) {
	const output =
		content.output.length > MAX_OUTPUT_CHARS
			? content.output.slice(-MAX_OUTPUT_CHARS)
			: content.output;
	const clipped = content.truncated || output.length < content.output.length;
	return (
		<div className="flex flex-col gap-1 font-mono text-xs">
			<div className="flex items-center gap-2 text-muted-foreground">
				<span className="truncate">$ {content.command}</span>
				{content.exitCode !== undefined && content.exitCode !== 0 && (
					<Badge variant="destructive">
						<Trans>exit {content.exitCode}</Trans>
					</Badge>
				)}
			</div>
			<pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2">
				{output}
			</pre>
			{clipped && (
				<span className="text-muted-foreground">
					<Trans>Output truncated</Trans>
				</span>
			)}
		</div>
	);
}
