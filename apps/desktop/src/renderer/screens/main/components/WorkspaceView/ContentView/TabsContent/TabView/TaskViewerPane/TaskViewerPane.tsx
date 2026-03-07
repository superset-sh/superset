import { ScrollArea } from "@superset/ui/scroll-area";
import { eq, or } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import type { MosaicBranch } from "react-mosaic-component";
import { LinearIcon } from "renderer/components/icons/LinearIcon";
import { EditableTitle } from "renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/EditableTitle";
import { TaskMarkdownRenderer } from "renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/TaskMarkdownRenderer";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { BasePaneWindow, PaneToolbarActions } from "../components";

const PRIORITY_LABELS: Record<string, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

interface TaskViewerPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	taskSlug: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function TaskViewerPane({
	paneId,
	path,
	tabId,
	taskSlug,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: TaskViewerPaneProps) {
	const collections = useCollections();
	const navigate = useNavigate();

	const { data: taskData } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.leftJoin({ assignee: collections.users }, ({ tasks, assignee }) =>
					eq(tasks.assigneeId, assignee.id),
				)
				.select(({ tasks, status, assignee }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
				}))
				.where(({ tasks }) =>
					or(eq(tasks.id, taskSlug), eq(tasks.slug, taskSlug)),
				),
		[collections, taskSlug],
	);

	const task = useMemo(() => {
		if (!taskData || taskData.length === 0) return null;
		return taskData[0];
	}, [taskData]);

	const handleSaveTitle = useCallback(
		(title: string) => {
			if (!task) return;
			collections.tasks.update(task.id, (draft) => {
				draft.title = title;
			});
		},
		[task, collections],
	);

	const handleSaveDescription = useCallback(
		(markdown: string) => {
			if (!task) return;
			collections.tasks.update(task.id, (draft) => {
				draft.description = markdown;
			});
		},
		[task, collections],
	);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between">
					<div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-2">
						<LinearIcon className="size-4 shrink-0 rounded" />
						<span className="shrink-0 text-xs font-semibold">
							{task?.slug ?? taskSlug}
						</span>
						{task?.title && (
							<span className="truncate text-xs text-muted-foreground">
								{task.title}
							</span>
						)}
					</div>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
						closeHotkeyId="CLOSE_TERMINAL"
						leadingActions={
							<button
								type="button"
								title="Open in task view"
								className="flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground transition-colors"
								onClick={() =>
									navigate({
										to: "/tasks/$taskId",
										params: { taskId: taskSlug },
									})
								}
							>
								<LuExternalLink className="size-3.5" />
							</button>
						}
					/>
				</div>
			)}
		>
			{task ? (
				<ScrollArea className="h-full">
					<div className="p-6 max-w-4xl">
						<EditableTitle value={task.title} onSave={handleSaveTitle} />
						<div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<StatusIcon
									type={task.status.type as StatusType}
									color={task.status.color}
									progress={task.status.progressPercent ?? undefined}
									className="size-4"
								/>
								<span>{task.status.name}</span>
							</div>
							<div className="flex items-center gap-1.5">
								<PriorityIcon
									priority={task.priority}
									statusType={task.status.type}
									className="size-4"
								/>
								<span>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
							</div>
							<div className="flex items-center gap-1.5">
								{task.assignee ? (
									<>
										{task.assignee.image ? (
											<img
												src={task.assignee.image}
												alt=""
												className="size-4 rounded-full"
											/>
										) : (
											<div className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px]">
												{task.assignee.name?.charAt(0)?.toUpperCase() ?? "?"}
											</div>
										)}
										<span>{task.assignee.name}</span>
									</>
								) : (
									<>
										<HiOutlineUserCircle className="size-4" />
										<span>Unassigned</span>
									</>
								)}
							</div>
						</div>
						<TaskMarkdownRenderer
							content={task.description ?? ""}
							onSave={handleSaveDescription}
						/>
					</div>
				</ScrollArea>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
					Task not found
				</div>
			)}
		</BasePaneWindow>
	);
}
