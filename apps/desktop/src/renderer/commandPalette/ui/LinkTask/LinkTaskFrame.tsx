import { Trans, useLingui } from "@lingui/react/macro";
import {
	CommandEmpty,
	CommandGroup,
	CommandList,
	CommandItem as RawCommandItem,
} from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { useDeferredValue, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useHybridSearch } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useHybridSearch";
import { TASK_PICKER_INPUT } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksData";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions/useOptimisticActions";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

const MAX_RESULTS = 25;

// Matches tasks list view ordering: in progress → todo → backlog → done → canceled.
const STATUS_TYPE_ORDER: Record<string, number> = {
	started: 0,
	unstarted: 1,
	backlog: 2,
	completed: 3,
	canceled: 4,
};

const PRIORITY_ORDER: Record<string, number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4,
};

interface LinkTaskFrameProps {
	workspaceId: string;
}

export function LinkTaskFrame({ workspaceId }: LinkTaskFrameProps) {
	const { t } = useLingui();
	const query = useCommandPaletteQuery();
	const deferredQuery = useDeferredValue(query);
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const { v2Workspaces } = useOptimisticActions();

	const { data: taskPage } =
		cloudTrpc.task.listPage.useQuery(TASK_PICKER_INPUT);

	const tasks = useMemo(
		() =>
			(taskPage?.items ?? []).map(({ task }) => ({
				id: task.id,
				slug: task.slug,
				title: task.title,
				description: task.description,
				labels: task.labels,
				statusId: task.statusId,
				priority: task.priority,
				externalUrl: task.externalUrl,
				updatedAt: task.updatedAt,
			})),
		[taskPage],
	);

	const { data: statuses = [] } =
		cloudTrpc.task.statuses.list.useQuery(undefined);

	const statusMap = useMemo(() => {
		const map = new Map<
			string,
			{
				type: StatusType;
				color: string;
				position: number;
				progressPercent: number | null;
			}
		>();
		for (const s of statuses) {
			map.set(s.id, {
				type: s.type as StatusType,
				color: s.color,
				position: s.position,
				progressPercent: s.progressPercent,
			});
		}
		return map;
	}, [statuses]);

	const { search } = useHybridSearch(tasks);

	const filtered = useMemo(() => {
		if (!deferredQuery) {
			return [...tasks]
				.sort((a, b) => {
					const statusA = a.statusId ? statusMap.get(a.statusId) : undefined;
					const statusB = b.statusId ? statusMap.get(b.statusId) : undefined;
					const typeOrderA =
						STATUS_TYPE_ORDER[statusA?.type ?? ""] ?? Number.MAX_SAFE_INTEGER;
					const typeOrderB =
						STATUS_TYPE_ORDER[statusB?.type ?? ""] ?? Number.MAX_SAFE_INTEGER;
					if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
					const positionA = statusA?.position ?? Number.MAX_SAFE_INTEGER;
					const positionB = statusB?.position ?? Number.MAX_SAFE_INTEGER;
					if (positionA !== positionB) return positionA - positionB;
					const priorityOrderA =
						PRIORITY_ORDER[a.priority] ?? Number.MAX_SAFE_INTEGER;
					const priorityOrderB =
						PRIORITY_ORDER[b.priority] ?? Number.MAX_SAFE_INTEGER;
					return priorityOrderA - priorityOrderB;
				})
				.slice(0, MAX_RESULTS);
		}
		return search(deferredQuery)
			.slice(0, MAX_RESULTS)
			.map((r) => r.item);
	}, [deferredQuery, search, tasks, statusMap]);

	const handleSelect = (taskId: string, slug: string) => {
		v2Workspaces.updateWorkspace(workspaceId, { taskId });
		toast.success(
			t({
				message: `Linked ${slug} to workspace`,
			}),
		);
		setOpen(false);
	};

	return (
		<CommandList className="max-h-[400px]">
			<CommandEmpty>
				<Trans>No tasks found.</Trans>
			</CommandEmpty>
			{filtered.length > 0 && (
				<CommandGroup
					heading={
						deferredQuery ? t({ message: "Results" }) : t({ message: "Tasks" })
					}
				>
					{filtered.map((task) => {
						const status = task.statusId
							? statusMap.get(task.statusId)
							: undefined;
						return (
							<RawCommandItem
								key={task.id}
								value={`${task.slug} ${task.title}`}
								onSelect={() => handleSelect(task.id, task.slug)}
								className="group items-start gap-3 rounded-md px-2.5 py-2"
							>
								<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
									{status ? (
										<StatusIcon
											type={status.type}
											color={status.color}
											progress={status.progressPercent ?? undefined}
										/>
									) : (
										<span className="size-3.5 rounded-full border border-muted-foreground/40" />
									)}
								</span>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-sm leading-snug">
										{task.title}
									</span>
									<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
										<span className="font-mono">{task.slug}</span>
										{status ? (
											<>
												<span aria-hidden>·</span>
												<span className="capitalize">{status.type}</span>
											</>
										) : null}
									</span>
								</div>
							</RawCommandItem>
						);
					})}
				</CommandGroup>
			)}
		</CommandList>
	);
}
