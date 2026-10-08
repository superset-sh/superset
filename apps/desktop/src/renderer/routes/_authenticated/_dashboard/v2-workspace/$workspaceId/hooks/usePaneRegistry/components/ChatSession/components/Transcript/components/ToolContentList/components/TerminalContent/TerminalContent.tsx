import { Trans } from "@lingui/react/macro";
import type { ToolContent } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { DetailScroll } from "../DetailScroll";

const MAX_OUTPUT_CHARS = 20_000;

type TerminalToolContent = Extract<ToolContent, { type: "terminal" }>;

/**
 * A command the way a terminal shows it: the prompt line, the output as it
 * came, and the exit code last, in a box that follows the output while the
 * command still runs.
 */
export function TerminalContent({
	content,
	streaming = false,
}: {
	content: TerminalToolContent;
	streaming?: boolean;
}) {
	const output =
		content.output.length > MAX_OUTPUT_CHARS
			? content.output.slice(-MAX_OUTPUT_CHARS)
			: content.output;
	const clipped = content.truncated || output.length < content.output.length;
	const contentKey = [
		content.command,
		output,
		content.exitCode ?? "-",
		clipped,
	].join("\0");
	return (
		<DetailScroll
			className="mt-1"
			contentKey={contentKey}
			scrollClassName="rounded-lg border border-border/60 bg-background"
			streaming={streaming}
		>
			<div className="flex flex-col gap-1.5 px-3 py-2 font-mono text-foreground/80 text-xs leading-relaxed">
				<div className="whitespace-pre-wrap break-words text-muted-foreground">
					$ {content.command}
				</div>
				{output !== "" && (
					<pre className="whitespace-pre-wrap break-words">{output}</pre>
				)}
				{clipped && (
					<div className="text-muted-foreground/70">
						<Trans>Output truncated</Trans>
					</div>
				)}
				{content.exitCode !== undefined && (
					<div
						className={cn(
							content.exitCode === 0
								? "text-muted-foreground/70"
								: "text-destructive",
						)}
					>
						<Trans>exit {content.exitCode}</Trans>
					</div>
				)}
			</div>
		</DetailScroll>
	);
}
