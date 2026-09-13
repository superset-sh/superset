import { useLingui } from "@lingui/react/macro";
import { formatCompactDuration } from "@superset/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { ChevronRight } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import type {
	AgentTreeNode,
	AgentTreeNodeStatus,
} from "../../utils/buildAgentTree";
import { AgentTreeAgentIcon } from "./components/AgentTreeAgentIcon";
import { AgentTreeStatusGlyph } from "./components/AgentTreeStatusGlyph";

export type AgentTreeVariant = "card" | "sidebar" | "menu";

export interface AgentTreeRowProps {
	node: AgentTreeNode;
	variant: AgentTreeVariant;
	/** For each ancestor level (outermost first), whether a rail continues past this row. */
	guides: readonly boolean[];
	isLast: boolean;
	expanded: boolean;
	selected: boolean;
	now: number;
	onOpen: (node: AgentTreeNode) => void;
	onToggle: (node: AgentTreeNode) => void;
}

const STATUS_TEXT_CLASS: Record<AgentTreeNodeStatus, string> = {
	idle: "text-muted-foreground",
	working: "text-amber-500",
	waiting: "text-yellow-500",
	review: "text-green-500",
	completed: "text-green-500",
	failed: "text-red-500",
	stopped: "text-muted-foreground",
};

export function AgentTreeRow({
	node,
	variant,
	guides,
	isLast,
	expanded,
	selected,
	now,
	onOpen,
	onToggle,
}: AgentTreeRowProps) {
	const { t } = useLingui();
	const hasChildren = node.children.length > 0;
	const compact = variant === "sidebar";

	const stateWord = (() => {
		switch (node.status) {
			case "waiting":
				return t({ message: "Needs input" });
			case "completed":
				return t({ message: "Completed" });
			case "failed":
				return t({ message: "Failed" });
			case "stopped":
				return t({ message: "Stopped" });
			case "review":
				return t({ message: "Ready for review" });
			case "idle":
				return t({ message: "Idle" });
			case "working":
				return undefined;
		}
	})();
	const elapsed = formatCompactDuration((node.endedAt ?? now) - node.startedAt);
	const activityText = node.activity
		? `${node.activity.toolName} ${node.activity.summary}`.trim()
		: undefined;

	const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
		const target = event.target as HTMLElement;
		if (hasChildren && target.closest("[data-agent-tree-toggle]")) {
			onToggle(node);
			return;
		}
		onOpen(node);
	};
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "ArrowRight" && hasChildren && !expanded) {
			event.preventDefault();
			onToggle(node);
		} else if (event.key === "ArrowLeft" && hasChildren && expanded) {
			event.preventDefault();
			onToggle(node);
		}
	};

	const row = (
		<button
			type="button"
			role="treeitem"
			aria-level={node.depth + 1}
			aria-selected={selected}
			{...(hasChildren ? { "aria-expanded": expanded } : {})}
			data-agent-tree-row
			data-node-key={node.key}
			tabIndex={-1}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			className={cn(
				"group/row flex w-full items-center gap-1.5 rounded-sm pr-1.5 text-left",
				compact ? "py-[3px]" : "py-1",
				"text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				selected && "bg-muted",
				node.endedAt !== undefined && "opacity-60",
			)}
		>
			{node.depth > 0 && (
				<span className="flex shrink-0 self-stretch" aria-hidden>
					{guides.map((continues, level) => (
						<span
							key={`${node.key}:${level}`}
							className={cn(
								"relative w-3.5",
								continues &&
									"before:absolute before:inset-y-0 before:left-[6px] before:border-l before:border-border",
							)}
						/>
					))}
					<span
						className={cn(
							"relative w-3.5",
							"before:absolute before:top-0 before:left-[6px] before:border-l before:border-border",
							isLast ? "before:h-1/2" : "before:inset-y-0",
							node.parentUnknown && "before:border-dashed",
							"after:absolute after:top-1/2 after:left-[6px] after:w-2 after:border-t after:border-border",
							node.parentUnknown && "after:border-dashed",
						)}
					/>
				</span>
			)}
			<span
				data-agent-tree-toggle
				className={cn(
					"flex size-3 shrink-0 items-center justify-center text-muted-foreground",
					hasChildren
						? "rounded-sm hover:bg-accent hover:text-foreground"
						: "invisible",
				)}
			>
				<ChevronRight
					className={cn("size-3 transition-transform", expanded && "rotate-90")}
				/>
			</span>
			{node.kind === "agent" && node.agentId ? (
				<span className="relative flex size-3 shrink-0 items-center justify-center">
					<AgentTreeAgentIcon agentId={node.agentId} />
					{node.status !== "idle" && (
						<span className="absolute -top-0.5 -right-0.5 scale-75">
							<AgentTreeStatusGlyph status={node.status} />
						</span>
					)}
				</span>
			) : (
				<AgentTreeStatusGlyph status={node.status} />
			)}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex min-w-0 items-center gap-1.5">
					<span
						className={cn(
							"min-w-0 truncate text-xs",
							node.kind === "agent" && "font-medium",
						)}
					>
						{node.title}
					</span>
					{!compact && node.subtitle && (
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{node.subtitle}
						</span>
					)}
				</span>
				{!compact && activityText && (
					<span className="truncate font-mono text-[10px] text-muted-foreground">
						<span className="mr-1 rounded-sm bg-muted px-1 text-foreground/70">
							{node.activity?.toolName}
						</span>
						{node.activity?.summary}
					</span>
				)}
			</span>
			<span
				className={cn(
					"flex shrink-0 flex-col items-end font-mono text-[10px] tabular-nums",
					compact ? "leading-none" : "leading-tight",
				)}
			>
				{compact ? (
					<span
						className={cn(
							STATUS_TEXT_CLASS[node.status],
							node.status === "working" && "text-muted-foreground",
						)}
					>
						{stateWord && node.status !== "completed" ? stateWord : elapsed}
					</span>
				) : (
					<>
						{stateWord && (
							<span className={STATUS_TEXT_CLASS[node.status]}>
								{stateWord}
							</span>
						)}
						<span className="text-muted-foreground">{elapsed}</span>
					</>
				)}
			</span>
		</button>
	);

	if (!compact) return row;

	const tooltip = [
		node.parentUnknown ? t({ message: "Parent unknown" }) : undefined,
		node.subtitle,
		activityText,
	].filter(Boolean);
	if (tooltip.length === 0) return row;

	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>{row}</TooltipTrigger>
			<TooltipContent side="right" className="max-w-72 font-mono text-[10px]">
				{tooltip.join(" · ")}
			</TooltipContent>
		</Tooltip>
	);
}
