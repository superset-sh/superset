import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { BotIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { TurnStatus } from "../../utils/group-assistant-turn";

interface AssistantTurnGroupProps {
	/** One-line summary, e.g. "3 tool calls · 1 subagent · 1 message". */
	summary: string;
	status: TurnStatus;
	/** When the turn started — shown as a compact clock in the header. */
	timestamp?: string | number | Date | null;
	/** Expanded on first render (live turns, errors, or when nothing else shows). */
	defaultOpen?: boolean;
	/** The intermediate step nodes (thinking, tools, images) — collapsible. */
	steps: ReactNode;
	/** The final answer — always visible, even when steps are collapsed. */
	lastOutput?: ReactNode;
}

function formatClock(value: string | number | Date | null | undefined): string {
	if (value == null) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

const STATUS_DOT_CLASS: Record<TurnStatus, string> = {
	in_progress: "bg-sky-500 animate-pulse",
	error: "bg-red-500",
	complete: "bg-emerald-500",
};

/**
 * Groups an assistant turn's intermediate actions into a single collapsible
 * card — the vendored agent-inspector's signature presentation — while the
 * final answer stays visible below the header. Reuses the existing
 * `ToolCallBlock`/`ReasoningBlock` nodes verbatim as `steps`.
 */
export function AssistantTurnGroup({
	summary,
	status,
	timestamp,
	defaultOpen = false,
	steps,
	lastOutput,
}: AssistantTurnGroupProps) {
	const clock = formatClock(timestamp);
	return (
		<div className="flex flex-col gap-1.5">
			<Collapsible defaultOpen={defaultOpen} className="not-prose group/turn">
				<CollapsibleTrigger
					className={cn(
						"flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left text-xs",
						"text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground",
						"outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
					)}
				>
					<ChevronRightIcon className="size-3 shrink-0 transition-transform group-data-[state=open]/turn:rotate-90" />
					<BotIcon className="size-3.5 shrink-0" />
					<span className="shrink-0 font-medium text-foreground">Claude</span>
					{summary ? (
						<>
							<span className="shrink-0 opacity-50">·</span>
							<span className="min-w-0 flex-1 truncate">{summary}</span>
						</>
					) : (
						<span className="min-w-0 flex-1" />
					)}
					{clock ? (
						<span className="shrink-0 text-[10px] tabular-nums opacity-60">
							{clock}
						</span>
					) : null}
					<span
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							STATUS_DOT_CLASS[status],
						)}
						aria-hidden
					/>
				</CollapsibleTrigger>
				<CollapsibleContent className="mt-1 ml-1.5 flex flex-col gap-2 border-l border-border/40 pl-3 outline-none">
					{steps}
				</CollapsibleContent>
			</Collapsible>
			{lastOutput ? <div className="min-w-0">{lastOutput}</div> : null}
		</div>
	);
}
