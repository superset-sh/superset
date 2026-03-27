import type {
	SelectTask,
	SelectTaskStatus,
	SelectUser,
} from "@superset/db/schema";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Separator } from "@superset/ui/separator";
import { eq, or } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { Route as TasksLayoutRoute } from "../layout";
import { ActivitySection } from "./components/ActivitySection";
import { EditableTitle } from "./components/EditableTitle";
import { PropertiesSidebar } from "./components/PropertiesSidebar";
import { TaskDetailHeader } from "./components/TaskDetailHeader";
import { TaskMarkdownRenderer } from "./components/TaskMarkdownRenderer";
import { useEscapeToNavigate } from "./hooks/useEscapeToNavigate";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/$taskId/",
)({
	component: TaskDetailPage,
});

type TaskDetailRecord = SelectTask & {
	status: SelectTaskStatus;
	assignee: SelectUser | null;
	creator: SelectUser | null;
};

function TaskDetailPage() {
	const { taskId } = Route.useParams();
	const { tab, assignee, search } = TasksLayoutRoute.useSearch();
	const navigate = useNavigate();
	const collections = useCollections();
	const isUuidTaskId =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			taskId,
		);

	const backSearch = useMemo(() => {
		const s: Record<string, string> = {};
		if (tab) s.tab = tab;
		if (assignee) s.assignee = assignee;
		if (search) s.search = search;
		return s;
	}, [tab, assignee, search]);
	useEscapeToNavigate("/tasks", { search: backSearch });

	// Support both UUID and slug lookups
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
				.leftJoin({ creator: collections.users }, ({ tasks, creator }) =>
					eq(tasks.creatorId, creator.id),
				)
				.select(({ tasks, status, assignee, creator }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
					creator: creator ?? null,
				}))
				.where(({ tasks }) => or(eq(tasks.id, taskId), eq(tasks.slug, taskId))),
		[collections, taskId],
	);

	const task: TaskDetailRecord | null = useMemo(() => {
		if (!taskData || taskData.length === 0) return null;
		const task = taskData[0];
		return {
			...task,
			assignee:
				typeof task.assignee?.id === "string"
					? (task.assignee as SelectUser)
					: null,
			creator:
				typeof task.creator?.id === "string"
					? (task.creator as SelectUser)
					: null,
		};
	}, [taskData]);
	const taskFallbackQuery = useQuery({
		queryKey: ["task-detail-fallback", taskId, isUuidTaskId ? "id" : "slug"],
		queryFn: () =>
			isUuidTaskId
				? apiTrpcClient.task.byId.query(taskId)
				: apiTrpcClient.task.bySlug.query(taskId),
		enabled: !task,
		retry: false,
	});
	const isTaskSyncing = !task && !!taskFallbackQuery.data;
	const isTaskLoading = !task && taskFallbackQuery.isPending;

	const handleBack = () => {
		navigate({ to: "/tasks", search: backSearch });
	};

	const handleSaveTitle = (title: string) => {
		if (!task) return;
		collections.tasks.update(task.id, (draft) => {
			draft.title = title;
		});
	};

	const handleSaveDescription = (markdown: string) => {
		if (!task) return;
		collections.tasks.update(task.id, (draft) => {
			draft.description = markdown;
		});
	};

	const handleDelete = () => {
		navigate({ to: "/tasks", search: backSearch });
	};
	const creatorName = task?.creator?.name?.trim() ? task.creator.name : null;

	if (!task) {
		if (isTaskLoading || isTaskSyncing) {
			return (
				<div className="flex-1 flex items-center justify-center">
					<span className="text-muted-foreground">
						{isTaskSyncing ? "Syncing task..." : "Loading task..."}
					</span>
				</div>
			);
		}

		return (
			<div className="flex-1 flex items-center justify-center">
				<span className="text-muted-foreground">Task not found</span>
			</div>
		);
	}

	return (
		<div className="flex-1 flex min-h-0">
			<div className="flex-1 flex flex-col min-h-0 min-w-0">
				<TaskDetailHeader
					task={task}
					onBack={handleBack}
					onDelete={handleDelete}
				/>

				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 py-6 max-w-4xl">
						<EditableTitle value={task.title} onSave={handleSaveTitle} />

						<TaskMarkdownRenderer
							content={task.description ?? ""}
							onSave={handleSaveDescription}
						/>

						{creatorName ? (
							<>
								<Separator className="my-8" />

								<h2 className="text-lg font-semibold mb-4">Activity</h2>

								<ActivitySection
									createdAt={new Date(task.createdAt)}
									creatorName={creatorName}
									creatorAvatarUrl={task.creator?.image}
								/>
							</>
						) : null}
					</div>
				</ScrollArea>
			</div>

			<PropertiesSidebar task={task} />
		</div>
	);
}
