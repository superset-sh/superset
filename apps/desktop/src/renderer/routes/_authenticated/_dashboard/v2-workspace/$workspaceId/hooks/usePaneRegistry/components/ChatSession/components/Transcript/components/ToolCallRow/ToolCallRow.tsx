import { Plural, Trans } from "@lingui/react/macro";
import type { ToolCall, ToolKind } from "@superset/chat/protocol";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import {
	FileText,
	FileX,
	Globe,
	MoveRight,
	PencilLine,
	Search,
	Sparkles,
	SquareTerminal,
	Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { ToolContentList } from "../ToolContentList";

/** How many trailing output lines a call shows without being expanded. */
const PREVIEW_LINES = 3;

const ICON_BY_KIND: Record<ToolKind, ComponentType<{ className?: string }>> = {
	read: FileText,
	edit: PencilLine,
	delete: FileX,
	move: MoveRight,
	search: Search,
	execute: SquareTerminal,
	think: Sparkles,
	fetch: Globe,
	other: Wrench,
};

function durationLabel(item: ToolCall): string | null {
	if (item.completedAtMs === undefined) return null;
	return `${((item.completedAtMs - item.startedAtMs) / 1000).toFixed(1)}s`;
}

/**
 * The tail, not the head: the end of a command's output is the part worth
 * seeing without opening anything.
 */
function outputTail(
	item: ToolCall,
): { lines: string[]; hidden: number } | null {
	const text = item.content
		.map((content) =>
			content.type === "text"
				? content.text
				: content.type === "terminal"
					? content.output
					: null,
		)
		.filter((value): value is string => value !== null)
		.join("\n")
		.trimEnd();
	if (text === "") return null;
	// A fence delimiter is markup, not a line of output, and in a three-line
	// preview it costs a third of what there is to see. Dropped rather than
	// peeled off the ends: the text may hold several blocks.
	const all = text
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("```"));
	return {
		lines: all.slice(-PREVIEW_LINES),
		hidden: Math.max(0, all.length - PREVIEW_LINES),
	};
}

/**
 * One line per call, the way an editor lists what an agent did: the tool's own
 * icon and title, the tail of its output beneath, and the rest behind a
 * disclosure that says how much it is hiding. Status rides the icon rather than
 * a chip, and the raw tool name stays out of it.
 */
export function ToolCallRow({ item }: { item: ToolCall }) {
	const [open, setOpen] = useState(false);
	const duration = durationLabel(item);
	const hasBody = item.content.length > 0;
	const Icon = ICON_BY_KIND[item.toolKind] ?? Wrench;
	const failed = item.status === "failed" || item.status === "declined";
	const tail = outputTail(item);

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<div
				className={cn(
					"flex items-center gap-2 py-0.5 text-sm",
					failed ? "text-destructive" : "text-muted-foreground",
				)}
			>
				<Icon
					className={cn(
						"size-3.5 shrink-0",
						item.status === "running" && "animate-pulse",
					)}
				/>
				<span className="min-w-0 flex-1 truncate">{item.title}</span>
				{duration && (
					<span className="shrink-0 text-xs tabular-nums opacity-50">
						{duration}
					</span>
				)}
			</div>

			{tail && !open && (
				<div className="ml-[22px] flex flex-col overflow-hidden">
					{tail.lines.map((line, index) => (
						<span
							className="truncate font-mono text-muted-foreground/70 text-xs"
							// Output lines have no id and repeat; position is the identity.
							key={`${item.id}:${index}`}
						>
							{line}
						</span>
					))}
				</div>
			)}

			{hasBody && (
				<>
					<CollapsibleTrigger className="ml-[22px] py-0.5 text-muted-foreground/60 text-xs hover:text-foreground">
						{open ? (
							<Trans>Hide detail</Trans>
						) : tail && tail.hidden > 0 ? (
							<Plural
								one="+# more line"
								other="+# more lines"
								value={tail.hidden}
							/>
						) : (
							<Trans>Show detail</Trans>
						)}
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="mt-1 ml-[7px] flex flex-col gap-2 border-border/60 border-l pl-3">
							<ToolContentList itemId={item.id} items={item.content} />
						</div>
					</CollapsibleContent>
				</>
			)}
		</Collapsible>
	);
}
