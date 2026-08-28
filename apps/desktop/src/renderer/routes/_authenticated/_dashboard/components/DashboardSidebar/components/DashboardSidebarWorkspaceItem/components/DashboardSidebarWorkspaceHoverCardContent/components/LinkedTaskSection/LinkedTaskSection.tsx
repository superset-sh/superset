import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { LuExternalLink } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";

interface LinkedTaskSectionProps {
	taskId: string;
}

export function LinkedTaskSection({ taskId }: LinkedTaskSectionProps) {
	const { t } = useLingui();
	const { data: taskRecord } = cloudTrpc.task.byIdOrSlug.useQuery(taskId);
	const { data: statuses } = cloudTrpc.task.statuses.list.useQuery(undefined);

	if (!taskRecord) return null;

	const status =
		statuses?.find((entry) => entry.id === taskRecord.statusId) ?? null;
	const task = {
		id: taskRecord.id,
		slug: taskRecord.slug,
		title: taskRecord.title,
		externalUrl: taskRecord.externalUrl,
		statusType: status?.type ?? null,
		statusColor: status?.color ?? null,
		statusProgress: status?.progressPercent ?? null,
	};

	return (
		<div className="pt-2 border-t border-border space-y-0.5">
			<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
				<Trans id="dashboard.sidebar.linkedTask.taskLabel">Task</Trans>
			</span>
			<div className="flex items-center gap-1.5">
				<Link
					to="/tasks/$taskId"
					params={{ taskId: task.id }}
					className="group/task flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-foreground"
					title={task.title}
				>
					<span className="flex size-3.5 shrink-0 items-center justify-center">
						{task.statusType ? (
							<StatusIcon
								type={task.statusType as StatusType}
								color={task.statusColor ?? "#9ca3af"}
								progress={task.statusProgress ?? undefined}
							/>
						) : (
							<span className="size-3 rounded-full border border-muted-foreground/40" />
						)}
					</span>
					<span className="font-mono text-xs text-muted-foreground shrink-0">
						{task.slug}
					</span>
					<span className="truncate text-xs">{task.title}</span>
				</Link>
				{task.externalUrl && (
					<a
						href={task.externalUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="shrink-0 text-muted-foreground hover:text-foreground"
						title={t({
							id: "dashboard.sidebar.linkedTask.openExternally",
							message: "Open task externally",
						})}
						onClick={(e) => e.stopPropagation()}
					>
						<LuExternalLink className="size-3" />
					</a>
				)}
			</div>
		</div>
	);
}
