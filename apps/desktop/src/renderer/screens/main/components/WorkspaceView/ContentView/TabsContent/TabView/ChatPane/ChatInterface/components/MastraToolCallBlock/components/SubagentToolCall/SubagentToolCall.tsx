import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/lib/utils";
import { BotIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { MarkdownToggleContent } from "../../../../../../components/MarkdownToggleContent";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { parseSubagentToolResult } from "./utils/parseSubagentToolResult";

interface SubagentToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function SubagentToolCall({
	part,
	args,
	result,
}: SubagentToolCallProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [renderMarkdown, setRenderMarkdown] = useState(true);
	const markdownToggleId = useId();
	const isPending =
		part.state !== "output-available" && part.state !== "output-error";
	const isError =
		part.state === "output-error" ||
		result.isError === true ||
		(asString(result.error) ?? "").length > 0;
	const task = asString(args.task) ?? "Running subagent task...";
	const agentType = asString(args.agentType) ?? "subagent";
	const parsed = useMemo(() => parseSubagentToolResult(result), [result]);

	const hasDetails =
		task.length > 0 ||
		parsed.text.length > 0 ||
		parsed.tools.length > 0 ||
		Boolean(parsed.modelId) ||
		parsed.durationMs !== undefined;

	return (
		<Collapsible
			className="overflow-hidden rounded-md"
			onOpenChange={(open) => hasDetails && setIsOpen(open)}
			open={hasDetails ? isOpen : false}
		>
			<CollapsibleTrigger asChild>
				<button
					className={
						hasDetails
							? "flex h-7 w-full items-center justify-between px-2.5 text-left transition-colors duration-150 hover:bg-muted/30"
							: "flex h-7 w-full items-center justify-between px-2.5 text-left"
					}
					disabled={!hasDetails}
					type="button"
				>
					<div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
						<BotIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
						<ShimmerLabel
							className="truncate text-xs text-muted-foreground"
							isShimmering={isPending}
						>
							{`Subagent (${agentType})`}
						</ShimmerLabel>
					</div>
					<div className="ml-2 flex h-6 w-6 items-center justify-center text-muted-foreground">
						{isPending ? (
							<Loader2Icon className="h-3 w-3 animate-spin" />
						) : isError ? (
							<XIcon className="h-3 w-3" />
						) : (
							<CheckIcon className="h-3 w-3" />
						)}
					</div>
				</button>
			</CollapsibleTrigger>
			{hasDetails && (
				<CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
					<div className="mt-0.5 space-y-2 rounded border bg-muted/20 p-2.5 text-xs">
						<div className="font-medium text-foreground">{task}</div>
						<div className="text-muted-foreground">
							{agentType}
							{parsed.modelId ? ` • ${parsed.modelId}` : ""}
							{parsed.durationMs !== undefined
								? ` • ${Math.round(parsed.durationMs)} ms`
								: ""}
						</div>
						{parsed.tools.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{parsed.tools.map((tool, index) => (
									<span
										key={`${tool.name}-${index}`}
										className={cn(
											"rounded-full border px-2 py-0.5",
											tool.isError
												? "border-destructive/40 bg-destructive/10 text-destructive"
												: "border-muted-foreground/30 bg-background/80 text-muted-foreground",
										)}
									>
										{tool.name}
									</span>
								))}
							</div>
						) : null}
						{parsed.text ? (
							<MarkdownToggleContent
								toggleId={markdownToggleId}
								checked={renderMarkdown}
								onCheckedChange={setRenderMarkdown}
								content={parsed.text}
								markdownContainerClassName="max-h-[32rem] overflow-auto rounded border bg-background/80 p-2"
								plainContainerClassName="max-h-[32rem] overflow-auto rounded border bg-background/80 p-2 text-xs whitespace-pre-wrap break-words"
							/>
						) : null}
					</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
