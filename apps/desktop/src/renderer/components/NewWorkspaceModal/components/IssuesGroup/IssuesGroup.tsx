import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { getSlugColumnWidth } from "renderer/lib/slug-width";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";

export function IssuesGroup() {
	const collections = useCollections();

	const { data } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin(
					{ status: collections.taskStatuses },
					({ tasks, status }) => eq(tasks.statusId, status.id),
				)
				.select(({ tasks, status }) => ({
					...tasks,
					status,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const tasks = useMemo(() => data ?? [], [data]);

	const slugWidth = useMemo(
		() => getSlugColumnWidth(tasks.map((t) => t.slug)),
		[tasks],
	);

	return (
		<CommandGroup>
			<CommandEmpty>No issues found.</CommandEmpty>
			{tasks.map((task) => (
				<CommandItem
					key={task.id}
					value={`${task.slug} ${task.title}`}
					onSelect={() => {
						console.log("[mock] Create workspace from issue", task.slug);
					}}
					className="group"
				>
					<StatusIcon
						type={task.status.type as StatusType}
						color={task.status.color}
						className="size-4 shrink-0"
					/>
					<span
						className="text-muted-foreground shrink-0 text-xs tabular-nums truncate"
						style={{ width: slugWidth }}
					>
						{task.slug}
					</span>
					<span className="truncate flex-1">{task.title}</span>
					<span className="text-xs text-muted-foreground shrink-0 hidden group-data-[selected=true]:inline">
						Open →
					</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}
