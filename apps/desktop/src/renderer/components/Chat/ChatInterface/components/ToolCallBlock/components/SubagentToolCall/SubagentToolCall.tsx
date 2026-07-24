import {
	MessageResponse,
	TOOL_CALL_MD_CLASSNAME,
} from "@superset/ui/ai-elements/message";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { BotIcon, TerminalIcon } from "lucide-react";
import { useMemo } from "react";
import { SubagentInnerToolCall } from "renderer/components/Chat/components/SubagentInnerToolCall";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { parseSubagentToolResult } from "./utils/parseSubagentToolResult";

interface SubagentToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	workspaceId?: string;
	workspaceCwd?: string;
	onOpenFileInPane?: (filePath: string) => void;
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
	// Round to whole seconds first, then split, so the remainder can't carry to 60.
	const roundedSeconds = Math.round(seconds);
	const minutes = Math.floor(roundedSeconds / 60);
	const remainder = roundedSeconds % 60;
	return `${minutes}m ${remainder}s`;
}

export function SubagentToolCall({
	part,
	args,
	result,
	workspaceId,
	workspaceCwd,
	onOpenFileInPane,
}: SubagentToolCallProps) {
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
		task.length > 0 || parsed.text.length > 0 || parsed.tools.length > 0;

	// Title: a "TASK" badge + "Agent {type}", matching the inspector card.
	const titleNode = (
		<span className="flex shrink-0 items-center gap-1.5 font-medium text-xs">
			<span className="rounded border border-sky-500/40 px-1 py-px font-semibold text-[9px] text-sky-400 uppercase tracking-wide">
				Task
			</span>
			<span className="text-foreground">Agent</span>
			<span className="text-muted-foreground">{agentType}</span>
		</span>
	);

	const toolCallLabel = `${parsed.tools.length} tool call${
		parsed.tools.length === 1 ? "" : "s"
	}`;

	// Surface the subagent's model + run duration (parsed from <subagent-meta>),
	// matching the agent-inspector subagent card.
	const durationLabel =
		typeof parsed.durationMs === "number"
			? formatDuration(parsed.durationMs)
			: "";
	const metaBits = [parsed.modelId, durationLabel].filter(
		(bit): bit is string => Boolean(bit),
	);
	const headerExtra =
		metaBits.length > 0 ? (
			<span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
				{metaBits.join(" · ")}
			</span>
		) : undefined;

	return (
		// Distinct card so the spawned agent reads as its own contained unit
		// (matching the agent-inspector subagent card), set apart from the
		// parent turn's inline steps.
		<div className="rounded-md border border-border/60 bg-muted/20 px-2 py-0.5">
			<ToolCallRow
				icon={BotIcon}
				isError={isError}
				isPending={isPending}
				title={titleNode}
				headerExtra={headerExtra}
			>
				{hasDetails ? (
					<div className="space-y-2 pl-2 text-xs">
						<MessageResponse
							animated={false}
							className={`font-medium ${TOOL_CALL_MD_CLASSNAME}`}
							isAnimating={false}
							mermaid={{ config: { theme: "default" } }}
						>
							{task}
						</MessageResponse>
						{parsed.tools.length > 0 ? (
							<div className="space-y-1">
								<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
									<TerminalIcon className="size-3 shrink-0" />
									<span className="font-medium">Execution Trace</span>
									<span className="opacity-50">·</span>
									<span>{toolCallLabel}</span>
								</div>
								{parsed.tools.map((tool, index) => (
									<SubagentInnerToolCall
										key={`${tool.name}-${index}`}
										name={tool.name}
										isError={tool.isError}
										args={tool.args}
										result={tool.result}
										workspaceId={workspaceId}
										workspaceCwd={workspaceCwd}
										onOpenFileInPane={onOpenFileInPane}
									/>
								))}
							</div>
						) : null}
						{parsed.text ? (
							<MessageResponse
								animated={false}
								className={`${TOOL_CALL_MD_CLASSNAME} [&_[data-streamdown=table-header-cell]]:px-2.5 [&_[data-streamdown=table-header-cell]]:py-1.5 [&_[data-streamdown=table-header-cell]]:text-xs [&_[data-streamdown=table-cell]]:px-2.5 [&_[data-streamdown=table-cell]]:py-1.5 [&_[data-streamdown=table-cell]]:text-xs`}
								isAnimating={false}
								mermaid={{ config: { theme: "default" } }}
							>
								{parsed.text}
							</MessageResponse>
						) : null}
					</div>
				) : undefined}
			</ToolCallRow>
		</div>
	);
}
