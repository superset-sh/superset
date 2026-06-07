import { cn } from "@superset/ui/utils";
import { LuCircleCheck, LuCircleDot, LuCircleX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	CommandCardLine,
	ComponentCardLine,
	WorkspaceCardConfig,
} from "shared/workspace-card-config";
import {
	type WorkspaceCardLineComponentProps,
	WorkspaceCardLineComponents,
} from "./WorkspaceCardLineComponents";

type ChecksStatus = "success" | "failure" | "pending" | "none";

interface CardPr {
	title: string;
	checksStatus?: ChecksStatus;
	reviewDecision?: string | null;
}

interface WorkspaceCardLinesProps {
	config: WorkspaceCardConfig;
	pr: CardPr | null | undefined;
	workspaceStatus: ActivePaneStatus | null;
	linearTicket?: { key: string; state: string; url: string } | null;
	/** Required for custom script lines — the command runs in this workspace. */
	workspaceId?: string;
	/** Required (with workspaceId) for component lines from the registry. */
	projectId?: string;
	branch?: string;
	workspaceName?: string;
}

const STATUS_LABELS: Record<ActivePaneStatus, string> = {
	working: "Agent working",
	permission: "Needs permission",
	review: "Ready for review",
};

const STATUS_DOT: Record<ActivePaneStatus, string> = {
	working: "bg-amber-400",
	permission: "bg-red-400",
	review: "bg-emerald-400",
};

function CustomLineRow({
	workspaceId,
	line,
}: {
	workspaceId: string;
	line: CommandCardLine;
}) {
	const { data } = electronTrpc.workspaces.getCardLineOutput.useQuery(
		{ workspaceId, lineId: line.id },
		{ staleTime: 60_000, refetchInterval: 120_000 },
	);
	if (!data?.output) return null;
	return (
		<div className="flex items-center gap-1.5 min-w-0">
			{line.label && (
				<span className="shrink-0 text-muted-foreground/60">{line.label}</span>
			)}
			<span className="truncate text-muted-foreground" title={data.output}>
				{data.output}
			</span>
		</div>
	);
}

function ComponentLineRow({
	line,
	...componentProps
}: WorkspaceCardLineComponentProps & { line: ComponentCardLine }) {
	const Component = WorkspaceCardLineComponents[line.component];
	// Unknown registry key (config from a newer app version) — render nothing.
	if (!Component) return null;
	return (
		<div className="flex items-center gap-1.5 min-w-0">
			{line.label && (
				<span className="shrink-0 text-muted-foreground/60">{line.label}</span>
			)}
			<Component {...componentProps} />
		</div>
	);
}

function ChecksIcon({ status }: { status: ChecksStatus }) {
	if (status === "success") {
		return <LuCircleCheck className="size-3 shrink-0 text-emerald-500/90" />;
	}
	if (status === "failure") {
		return <LuCircleX className="size-3 shrink-0 text-red-400/90" />;
	}
	if (status === "pending") {
		return <LuCircleDot className="size-3 shrink-0 text-amber-400/90" />;
	}
	return null;
}

/**
 * Extra always-visible lines on a sidebar workspace card. Which lines render
 * is driven by the project's workspaceCard config (.superset/config.json).
 */
export function WorkspaceCardLines({
	config,
	pr,
	workspaceStatus,
	linearTicket,
	workspaceId,
	projectId,
	branch,
	workspaceName,
}: WorkspaceCardLinesProps) {
	const showPrLine = config.prTitle && !!pr?.title;
	const showStatusLine = config.status && workspaceStatus !== null;
	const showLinearLine = config.linearTicket && !!linearTicket;
	const customLines = workspaceId
		? config.customLines.filter((line) => line.enabled)
		: [];

	if (
		!showPrLine &&
		!showStatusLine &&
		!showLinearLine &&
		customLines.length === 0
	) {
		return null;
	}

	return (
		<div className="flex flex-col gap-0.5 text-[11px] leading-tight">
			{showPrLine && pr && (
				<div className="flex items-center gap-1.5 min-w-0">
					{config.prChecks && pr.checksStatus && (
						<ChecksIcon status={pr.checksStatus} />
					)}
					<span className="truncate text-muted-foreground" title={pr.title}>
						{pr.title}
					</span>
					{config.prChecks && pr.reviewDecision === "approved" && (
						<span className="shrink-0 text-emerald-500/80">✓</span>
					)}
					{config.prChecks && pr.reviewDecision === "changes_requested" && (
						<span className="shrink-0 text-red-400/80">±</span>
					)}
				</div>
			)}
			{showLinearLine && linearTicket && (
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="shrink-0 font-mono text-muted-foreground/80">
						{linearTicket.key}
					</span>
					<span className="truncate text-muted-foreground/60">
						{linearTicket.state}
					</span>
				</div>
			)}
			{showStatusLine && workspaceStatus && (
				<div className="flex items-center gap-1.5">
					<span
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							STATUS_DOT[workspaceStatus],
						)}
					/>
					<span className="text-muted-foreground/70">
						{STATUS_LABELS[workspaceStatus]}
					</span>
				</div>
			)}
			{workspaceId &&
				customLines.map((line) =>
					line.type === "component" ? (
						projectId !== undefined && (
							<ComponentLineRow
								key={line.id}
								line={line}
								workspaceId={workspaceId}
								projectId={projectId}
								branch={branch ?? ""}
								workspaceName={workspaceName ?? ""}
							/>
						)
					) : (
						<CustomLineRow
							key={line.id}
							workspaceId={workspaceId}
							line={line}
						/>
					),
				)}
		</div>
	);
}
