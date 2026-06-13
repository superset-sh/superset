import type {
	SelectAutomation,
	SelectAutomationRun,
} from "@superset/db/schema";
import { formatDateTimeInTimezone } from "@superset/shared/rrule";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import {
	LuClipboard,
	LuFileText,
	LuMessageSquare,
	LuPencil,
	LuTerminal,
} from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import {
	getAutomationRunError,
	getAutomationRunSourceLabel,
	getAutomationRunStatusView,
	isAutomationRunTerminal,
} from "../../utils/automationRunDisplay";

interface AutomationRunResultPanelProps {
	automation: SelectAutomation;
	run: SelectAutomationRun | null;
	loading?: boolean;
	onEditPrompt: () => void;
}

function formatDate(
	value: Date | string | null | undefined,
	timezone: string,
): string {
	if (!value) return "-";
	return formatDateTimeInTimezone(new Date(value), timezone);
}

function computeDuration(run: SelectAutomationRun): string {
	const start = run.startedAt ?? run.dispatchedAt ?? run.createdAt;
	const end = run.completedAt ?? new Date();
	const ms = new Date(end).getTime() - new Date(start).getTime();
	if (!Number.isFinite(ms) || ms < 0) return "-";
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function getWaitingCopy(run: SelectAutomationRun): {
	title: string;
	description: string;
} {
	if (isAutomationRunTerminal(run)) {
		return {
			title: "No report was written",
			description: "Open the debug session to inspect what happened.",
		};
	}
	if (run.status === "dispatching" || run.status === "queued") {
		return {
			title: "Preparing run",
			description:
				"Superset has created the run and is preparing the host automation runner.",
		};
	}
	return {
		title: "Waiting for result",
		description:
			"The automation runner is active. The agent should write back a Markdown report when it finishes.",
	};
}

export function AutomationRunResultPanel({
	automation,
	run,
	loading,
	onEditPrompt,
}: AutomationRunResultPanelProps) {
	const navigate = useNavigate();

	if (!run) {
		return (
			<div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
				<LuFileText className="size-8 text-muted-foreground" />
				<div>
					<h2 className="text-sm font-medium">
						{loading ? "Loading run..." : "Run not found"}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{loading
							? "Waiting for the run record to sync."
							: "This automation run is no longer available."}
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={onEditPrompt}>
					<LuPencil className="size-4" />
					Edit prompt
				</Button>
			</div>
		);
	}

	const statusView = getAutomationRunStatusView(run.status);
	const error = getAutomationRunError(run);
	const hasDebugSession = !!run.v2WorkspaceId && !!run.sessionKind;
	const waitingCopy = getWaitingCopy(run);

	const openDebugSession = () => {
		if (!run.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", run.v2WorkspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: run.v2WorkspaceId },
			search: {
				terminalId: run.terminalSessionId ?? undefined,
				chatSessionId: run.chatSessionId ?? undefined,
			},
		});
	};

	const copyRunId = async () => {
		try {
			await navigator.clipboard.writeText(run.id);
			toast.success("Run ID copied");
		} catch {
			toast.error("Failed to copy run ID");
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
			<div className="shrink-0 border-b border-border px-8 py-5">
				<div className="flex min-w-0 items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="mb-2 flex items-center gap-2">
							<span
								className={cn(
									"inline-block size-2.5 shrink-0 rounded-full",
									statusView.dotClassName,
								)}
							/>
							<Badge
								variant="outline"
								className={cn("h-6 px-2", statusView.badgeClassName)}
							>
								{statusView.label}
							</Badge>
							<Badge variant="secondary" className="h-6 px-2">
								{getAutomationRunSourceLabel(run.source)}
							</Badge>
						</div>
						<h1 className="truncate text-xl font-semibold">
							{run.resultSummary || run.title || automation.name}
						</h1>
						<p className="mt-1 truncate text-sm text-muted-foreground">
							{automation.name}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button variant="ghost" size="icon-sm" onClick={copyRunId}>
							<LuClipboard className="size-4" />
						</Button>
						<Button variant="outline" size="sm" onClick={onEditPrompt}>
							<LuPencil className="size-4" />
							Edit prompt
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={openDebugSession}
							disabled={!hasDebugSession}
						>
							{run.sessionKind === "chat" ? (
								<LuMessageSquare className="size-4" />
							) : (
								<LuTerminal className="size-4" />
							)}
							Open {run.sessionKind === "chat" ? "chat" : "terminal"}
						</Button>
					</div>
				</div>

				<div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
					<Meta
						label="Scheduled"
						value={formatDate(run.scheduledFor, automation.timezone)}
					/>
					<Meta
						label="Started"
						value={formatDate(run.startedAt, automation.timezone)}
					/>
					<Meta
						label="Completed"
						value={formatDate(run.completedAt, automation.timezone)}
					/>
					<Meta label="Duration" value={computeDuration(run)} />
					<Meta label="Host" value={run.hostId ?? "Auto"} />
					<Meta
						label="Runtime"
						value={run.v2WorkspaceId ? "Workspace debug" : "Background"}
					/>
					<Meta label="Session" value={run.sessionKind ?? "-"} />
					<Meta label="Result" value={run.resultSource ?? "-"} />
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
				{error ? (
					<section className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 p-4 select-text cursor-text">
						<h2 className="text-sm font-medium text-destructive">
							{run.status === "skipped" || run.status === "skipped_offline"
								? "Skipped"
								: "Failed"}
						</h2>
						<p className="mt-2 whitespace-pre-wrap text-sm text-destructive/90">
							{error}
						</p>
					</section>
				) : null}

				{run.resultMarkdown ? (
					<MarkdownRenderer
						content={run.resultMarkdown}
						className="h-auto min-h-0 overflow-visible"
					/>
				) : (
					<div className="rounded-md border border-dashed border-border px-5 py-8 text-center">
						<h2 className="text-sm font-medium">{waitingCopy.title}</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							{waitingCopy.description}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function Meta({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="text-[11px] font-medium uppercase text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 truncate text-sm">{value}</div>
		</div>
	);
}
