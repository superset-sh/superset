import { type ComponentType, useEffect, useState } from "react";
import { LuCircleCheck, LuCircleDot, LuCircleX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHoverGitHubStatus } from "renderer/lib/githubQueryPolicy";
import { formatClockLine, formatPomodoroLine } from "./card-line-format";

/**
 * Props every registered card-line component receives. Components may use
 * electronTrpc hooks freely — they run inside the normal renderer tree.
 */
export interface WorkspaceCardLineComponentProps {
	workspaceId: string;
	projectId: string;
	branch: string;
	workspaceName: string;
}

/** Re-render on an interval so time-based lines tick without refetching. */
function useNow(intervalMs: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}

const TICK_MS = 30_000;

/** Elapsed time since workspace creation as 25-minute pomodoro cycles. */
function PomodoroCardLine({ workspaceId }: WorkspaceCardLineComponentProps) {
	const now = useNow(TICK_MS);
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		// v2 cloud workspace ids aren't in the local DB — fail silently, once.
		{ retry: false, staleTime: Number.POSITIVE_INFINITY },
	);
	if (!workspace?.createdAt) return null;
	return (
		<span className="truncate text-muted-foreground">
			{formatPomodoroLine(workspace.createdAt, now)}
		</span>
	);
}

/** Current local time, HH:MM. */
function ClockCardLine(_props: WorkspaceCardLineComponentProps) {
	const now = useNow(TICK_MS);
	return (
		<span className="truncate text-muted-foreground">
			{formatClockLine(now)}
		</span>
	);
}

const CHECKS_LABELS = {
	success: "Checks passing",
	failure: "Checks failing",
	pending: "Checks running",
} as const;

/**
 * Compact PR checks summary. Reuses the workspace-card GitHub fetch policy
 * (eager, no polling) — React Query dedupes with the card's own PR query.
 * Renders nothing when the workspace has no PR or no checks.
 */
function PrChecksInlineCardLine({
	workspaceId,
}: WorkspaceCardLineComponentProps) {
	const { githubStatus } = useHoverGitHubStatus({
		workspaceId,
		surface: "workspace-card",
		isWorktree: true,
		eager: true,
	});
	const pr = githubStatus?.pr;
	if (!pr?.checksStatus || pr.checksStatus === "none") return null;
	return (
		<span className="flex items-center gap-1 truncate text-muted-foreground">
			{pr.checksStatus === "success" && (
				<LuCircleCheck className="size-3 shrink-0 text-emerald-500/90" />
			)}
			{pr.checksStatus === "failure" && (
				<LuCircleX className="size-3 shrink-0 text-red-400/90" />
			)}
			{pr.checksStatus === "pending" && (
				<LuCircleDot className="size-3 shrink-0 text-amber-400/90" />
			)}
			{CHECKS_LABELS[pr.checksStatus]}
			{pr.reviewDecision === "approved" && (
				<span className="shrink-0 text-emerald-500/80">✓</span>
			)}
		</span>
	);
}

/**
 * Registry for component card lines: a customLines entry with
 * { type: "component", component: "<key>" } renders the matching component.
 * Unknown keys render nothing, so configs survive app downgrades.
 */
export const WorkspaceCardLineComponents: Record<
	string,
	ComponentType<WorkspaceCardLineComponentProps>
> = {
	pomodoro: PomodoroCardLine,
	clock: ClockCardLine,
	"pr-checks-inline": PrChecksInlineCardLine,
};
