import { cn } from "@superset/ui/utils";
import {
	BotIcon,
	CheckCircle2Icon,
	Clock3Icon,
	FileIcon,
	GitBranchIcon,
	GlobeIcon,
	ImageIcon,
	KeyRoundIcon,
	ShieldAlertIcon,
	SlidersHorizontalIcon,
	TimerIcon,
	XCircleIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { buildAgentTimelineDisplayModel } from "../../utils/buildAgentTimelineDisplayModel";
import { AgentToolCardV2 } from "../AgentToolCardV2";

export type AgentTimelinePart =
	| {
			type: "permission_requested";
			id: string;
			toolCallId: string;
			toolName: string;
			args: Record<string, unknown>;
			title?: string;
			displayName?: string;
			description?: string;
			decisionReason?: string;
			blockedPath?: string;
	  }
	| {
			type: "permission_resolved";
			id: string;
			requestId: string;
			toolCallId: string;
			toolName: string;
			decision: "approve" | "decline" | "always_allow_category" | "denied";
			message?: string;
	  }
	| {
			type: "tool_progress";
			id: string;
			toolCallId: string;
			toolName: string;
			elapsedTimeSeconds?: number;
			status?: "running" | "completed" | "failed" | "cancelled";
			summary?: string;
			taskId?: string;
	  }
	| {
			type: "subagent_event";
			id: string;
			taskId: string;
			toolCallId?: string;
			status:
				| "started"
				| "progress"
				| "updated"
				| "completed"
				| "failed"
				| "stopped";
			description?: string;
			subagentType?: string;
			summary?: string;
			lastToolName?: string;
			usage?: {
				totalTokens?: number;
				toolUses?: number;
				durationMs?: number;
			};
	  }
	| {
			type: "mode_changed";
			id: string;
			provider: string;
			mode: string;
			label?: string;
	  }
	| {
			type: "model_changed";
			id: string;
			provider: string;
			model: string;
			label?: string;
	  }
	| {
			type: "context_attachment";
			id: string;
			kind: "file" | "image" | "url" | "tool_artifact";
			title: string;
			url?: string;
			mediaType?: string;
			filename?: string;
			sourceToolCallId?: string;
	  }
	| {
			type: "branch_marker";
			id: string;
			label: string;
			branchId?: string;
			status: "placeholder" | "available" | "active";
	  };

interface AgentTimelinePartProps {
	part: AgentTimelinePart;
	className?: string;
}

function stringifyArgs(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function permissionDecisionLabel(
	decision: Extract<
		AgentTimelinePart,
		{ type: "permission_resolved" }
	>["decision"],
) {
	if (decision === "approve") return "Approved";
	if (decision === "always_allow_category") return "Always allowed";
	if (decision === "denied") return "Denied";
	return "Declined";
}

function usageText(
	usage: Extract<AgentTimelinePart, { type: "subagent_event" }>["usage"],
): string | null {
	if (!usage) return null;
	const parts = [
		usage.totalTokens !== undefined ? `${usage.totalTokens} tokens` : null,
		usage.toolUses !== undefined ? `${usage.toolUses} tools` : null,
		usage.durationMs !== undefined
			? `${Math.round(usage.durationMs / 1000)}s`
			: null,
	].filter(Boolean);
	return parts.length > 0 ? parts.join(" / ") : null;
}

function contextIcon(
	kind: Extract<AgentTimelinePart, { type: "context_attachment" }>["kind"],
): ComponentType<{ className?: string }> {
	if (kind === "url") return GlobeIcon;
	if (kind === "image") return ImageIcon;
	return FileIcon;
}

export function AgentTimelinePart({ part, className }: AgentTimelinePartProps) {
	const displayModel = buildAgentTimelineDisplayModel(part);
	if (displayModel.type === "inline_tool") {
		return (
			<AgentToolCardV2 className={className} part={displayModel.toolPart} />
		);
	}

	if (part.type === "model_changed" || part.type === "mode_changed") {
		const label =
			part.type === "model_changed"
				? part.label || part.model
				: part.label || part.mode;
		return (
			<div
				className={cn(
					"inline-flex w-fit items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-1 text-xs text-muted-foreground",
					className,
				)}
			>
				<SlidersHorizontalIcon className="size-3.5" />
				<span>{part.provider}</span>
				<span>{label}</span>
			</div>
		);
	}

	if (part.type === "context_attachment") {
		const Icon = contextIcon(part.kind);
		return (
			<div
				className={cn(
					"inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-1 text-xs text-muted-foreground",
					className,
				)}
			>
				<Icon className="size-3.5 shrink-0" />
				<span className="truncate">{part.title}</span>
			</div>
		);
	}

	if (part.type === "branch_marker") {
		return (
			<button
				type="button"
				disabled={part.status === "placeholder"}
				className={cn(
					"inline-flex w-fit items-center gap-1.5 rounded-full border bg-muted/30 px-2 py-1 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70",
					className,
				)}
				title={
					part.status === "placeholder"
						? "Branch conversations are reserved for a later runtime."
						: part.label
				}
			>
				<GitBranchIcon className="size-3.5" />
				<span>{part.label}</span>
			</button>
		);
	}

	if (part.type === "permission_requested") {
		return (
			<div
				className={cn(
					"w-full max-w-[760px] rounded-lg border border-amber-300/40 bg-amber-50/40 p-3 text-sm dark:bg-amber-950/10",
					className,
				)}
			>
				<div className="flex items-center gap-2 font-medium text-foreground">
					<ShieldAlertIcon className="size-4 text-amber-500" />
					<span>
						{part.title ||
							part.displayName ||
							`${part.toolName} needs approval`}
					</span>
				</div>
				{part.description && (
					<div className="mt-1 text-xs text-muted-foreground">
						{part.description}
					</div>
				)}
				<details className="mt-2">
					<summary className="cursor-pointer select-none text-xs text-muted-foreground">
						Request details
					</summary>
					<pre className="mt-2 max-h-48 overflow-auto rounded-md bg-background/70 p-2 text-[11px]">
						{stringifyArgs(part.args)}
					</pre>
				</details>
			</div>
		);
	}

	if (part.type === "permission_resolved") {
		const declined = part.decision === "decline" || part.decision === "denied";
		return (
			<div
				className={cn(
					"inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs",
					declined
						? "border-destructive/30 text-destructive"
						: "border-emerald-500/30 text-emerald-600",
					className,
				)}
			>
				{declined ? (
					<XCircleIcon className="size-3.5" />
				) : (
					<CheckCircle2Icon className="size-3.5" />
				)}
				<span>
					{permissionDecisionLabel(part.decision)} {part.toolName}
				</span>
			</div>
		);
	}

	if (part.type === "tool_progress") {
		return (
			<div
				className={cn(
					"inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-muted/30 px-2 py-1 text-xs text-muted-foreground",
					className,
				)}
			>
				<TimerIcon className="size-3.5" />
				<span>{part.toolName}</span>
				{part.elapsedTimeSeconds !== undefined && (
					<span>{Math.max(0, Math.round(part.elapsedTimeSeconds))}s</span>
				)}
				{part.summary && <span className="truncate">{part.summary}</span>}
			</div>
		);
	}

	const usage = usageText(part.usage);
	return (
		<div
			className={cn(
				"w-full max-w-[760px] rounded-lg border bg-background/80 p-3 text-sm",
				part.status === "failed" && "border-destructive/30",
				className,
			)}
		>
			<div className="flex items-center gap-2 font-medium text-foreground">
				{part.status === "completed" ? (
					<CheckCircle2Icon className="size-4 text-emerald-500" />
				) : part.status === "failed" || part.status === "stopped" ? (
					<XCircleIcon className="size-4 text-destructive" />
				) : (
					<BotIcon className="size-4 text-muted-foreground" />
				)}
				<span>{part.subagentType || "Subagent"}</span>
				<span className="rounded-full border px-1.5 py-0.5 text-[11px] text-muted-foreground">
					{part.status}
				</span>
			</div>
			{part.description && (
				<div className="mt-1 text-xs text-muted-foreground">
					{part.description}
				</div>
			)}
			{part.summary && (
				<div className="mt-2 select-text whitespace-pre-wrap text-xs text-foreground">
					{part.summary}
				</div>
			)}
			<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
				{part.lastToolName && (
					<span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5">
						<Clock3Icon className="size-3" />
						{part.lastToolName}
					</span>
				)}
				{usage && (
					<span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5">
						<KeyRoundIcon className="size-3" />
						{usage}
					</span>
				)}
			</div>
		</div>
	);
}
