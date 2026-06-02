import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { BotIcon, ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { TurnStatus } from "../../utils/group-assistant-turn";

interface AssistantTurnGroupProps {
	/** One-line summary, e.g. "3 tool calls · 1 subagent · 1 message". */
	summary: string;
	status: TurnStatus;
	/**
	 * A required user action (e.g. plan approval) is pending. Overrides the
	 * status dot with an amber "awaiting" state so a collapsed turn still signals
	 * that something needs attention.
	 */
	pendingAction?: boolean;
	/** When the turn started — shown as a compact clock in the header. */
	timestamp?: string | number | Date | null;
	/** Whether the turn should be open: live/errored turns expand, finished ones collapse. */
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

const STATUS_LABEL: Record<TurnStatus, string> = {
	in_progress: "Running",
	error: "Failed",
	complete: "Done",
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
	pendingAction = false,
	timestamp,
	defaultOpen = false,
	steps,
	lastOutput,
}: AssistantTurnGroupProps) {
	const dotClass = pendingAction ? "bg-amber-500" : STATUS_DOT_CLASS[status];
	const statusLabel = pendingAction
		? "Awaiting approval"
		: STATUS_LABEL[status];
	// Controlled open state so a turn that started open while streaming collapses
	// once it finishes (`defaultOpen` flips to false) — unless the user has
	// manually toggled it, in which case their choice wins.
	const [open, setOpen] = useState(defaultOpen);
	const userToggled = useRef(false);
	useEffect(() => {
		if (!userToggled.current) setOpen(defaultOpen);
	}, [defaultOpen]);
	const handleOpenChange = (next: boolean) => {
		userToggled.current = true;
		setOpen(next);
	};

	const clock = formatClock(timestamp);
	return (
		<div className="flex flex-col gap-1.5">
			<Collapsible
				open={open}
				onOpenChange={handleOpenChange}
				className="not-prose group/turn"
			>
				<CollapsibleTrigger
					className={cn(
						"flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left text-xs",
						"text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground",
						"outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
					)}
				>
					<ChevronRightIcon className="size-3 shrink-0 transition-transform group-data-[state=open]/turn:rotate-90" />
					<BotIcon className="size-3.5 shrink-0" />
					<span className="shrink-0 font-medium text-foreground">
						Assistant
					</span>
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
					<span className="sr-only">{statusLabel}</span>
					<span
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							dotClass,
							pendingAction && "animate-pulse",
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
