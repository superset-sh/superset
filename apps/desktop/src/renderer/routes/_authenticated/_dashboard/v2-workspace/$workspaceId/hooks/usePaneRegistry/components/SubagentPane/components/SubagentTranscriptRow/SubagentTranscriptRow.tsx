import { Trans } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { cn } from "@superset/ui/utils";
import type { inferRouterOutputs } from "@trpc/server";

type SubagentTranscriptEntry = NonNullable<
	NonNullable<
		inferRouterOutputs<AppRouter>["terminalAgents"]["subagentTranscript"]
	>["transcript"]
>["entries"][number];

interface SubagentTranscriptRowProps {
	entry: SubagentTranscriptEntry;
}

/** Tool results past this length collapse behind a disclosure. */
const LONG_RESULT_CHARS = 600;

export function SubagentTranscriptRow({ entry }: SubagentTranscriptRowProps) {
	switch (entry.kind) {
		case "user":
			return (
				<div className="rounded-sm border border-border/60 bg-muted/40 px-2.5 py-1.5">
					<div className="mb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
						<Trans>Prompt</Trans>
					</div>
					<pre className="whitespace-pre-wrap font-sans text-xs">
						{entry.text}
					</pre>
				</div>
			);
		case "assistant":
			return (
				<pre className="whitespace-pre-wrap px-0.5 font-sans text-xs leading-relaxed">
					{entry.text}
				</pre>
			);
		case "thinking":
			return (
				<details className="group text-xs text-muted-foreground">
					<summary className="cursor-pointer select-none text-[10px] font-medium tracking-wide uppercase">
						<Trans>Thinking</Trans>
					</summary>
					<pre className="mt-1 whitespace-pre-wrap font-sans text-xs">
						{entry.text}
					</pre>
				</details>
			);
		case "tool_call":
			return (
				<div className="flex min-w-0 items-baseline gap-2 font-mono text-[11px]">
					<span className="shrink-0 rounded-sm bg-muted px-1 py-px text-muted-foreground">
						{entry.toolName}
					</span>
					<span className="min-w-0 truncate" title={entry.text}>
						{entry.text}
					</span>
				</div>
			);
		case "tool_result": {
			const long = entry.text.length > LONG_RESULT_CHARS;
			const body = (
				<pre
					className={cn(
						"whitespace-pre-wrap font-mono text-[11px] text-muted-foreground",
						!long && "max-h-40 overflow-hidden",
					)}
				>
					{entry.text || <Trans>(no output)</Trans>}
				</pre>
			);
			if (!long) return <div className="pl-3">{body}</div>;
			return (
				<details className="pl-3">
					<summary className="cursor-pointer select-none text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
						<Trans>Output</Trans>
					</summary>
					<div className="mt-1 max-h-96 overflow-y-auto">{body}</div>
				</details>
			);
		}
		default:
			return null;
	}
}
