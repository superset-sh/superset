import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { LuExternalLink } from "react-icons/lu";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface LinkedTaskSectionProps {
	taskId: string;
}

export function LinkedTaskSection({ taskId }: LinkedTaskSectionProps) {
	const collections = useCollections();

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ t: collections.tasks })
				.leftJoin({ s: collections.taskStatuses }, ({ t, s }) =>
					eq(t.statusId, s.id),
				)
				.where(({ t }) => eq(t.id, taskId))
				.select(({ t, s }) => ({
					id: t.id,
					slug: t.slug,
					title: t.title,
					externalUrl: t.externalUrl,
					statusType: s?.type ?? null,
					statusColor: s?.color ?? null,
					statusProgress: s?.progressPercent ?? null,
				})),
		[collections, taskId],
	);

	const task = rows[0];
	if (!task) return null;

	return (
		<div className="pt-2 border-t border-border space-y-0.5">
			<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
				Task
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
						title="Open task externally"
						onClick={(e) => e.stopPropagation()}
					>
						<LuExternalLink className="size-3" />
					</a>
				)}
			</div>
		</div>
	);
}
