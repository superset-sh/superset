import { Trans } from "@lingui/react/macro";
import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Separator } from "@superset/ui/separator";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import type { TaskAssignee } from "../components/TasksView/hooks/useTasksData";
import { TASK_LIST_REFETCH_INTERVAL } from "../components/TasksView/hooks/useTasksData";
import { Route as TasksLayoutRoute } from "../layout";
import { tasksSearchFromFilters } from "../stores/tasks-filter-state";
import { ActivitySection } from "./components/ActivitySection";
import { EditableTitle } from "./components/EditableTitle";
import { PropertiesSidebar } from "./components/PropertiesSidebar";
import { TaskDetailHeader } from "./components/TaskDetailHeader";
import { useEscapeToNavigate } from "./hooks/useEscapeToNavigate";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/$taskId/",
)({
	component: TaskDetailPage,
});

type TaskDetailRecord = SelectTask & {
	status: SelectTaskStatus;
	assignee: TaskAssignee | null;
	creator: TaskAssignee | null;
};

function TaskDetailPage() {
	const { taskId } = Route.useParams();
	const {
		tab,
		assignee,
		search: searchQuery,
		type,
		project,
		projects,
		linearProject,
		state,
	} = TasksLayoutRoute.useSearch();
	const navigate = useNavigate();
	const { tasks: taskActions } = useOptimisticActions();

	const backSearch = useMemo(() => {
		return tasksSearchFromFilters({
			tab: tab ?? "all",
			assignee: assignee ?? null,
			search: searchQuery ?? "",
			typeTab: type === "issues" ? "issues" : "tasks",
			projectFilters: resolveProjectFilterParams(projects, project, []),
			linearProjectFilter: linearProject ?? null,
			includeClosedIssues: state === "all",
		});
	}, [
		tab,
		assignee,
		searchQuery,
		type,
		project,
		projects,
		linearProject,
		state,
	]);
	useEscapeToNavigate("/tasks", { search: backSearch });

	// Support both UUID and slug lookups
	const { data: taskRecord, isPending: isTaskPending } =
		cloudTrpc.task.byIdOrSlug.useQuery(taskId, {
			refetchInterval: TASK_LIST_REFETCH_INTERVAL,
			retry: false,
		});
	const { data: statuses, isPending: areStatusesPending } =
		cloudTrpc.task.statuses.list.useQuery(undefined, {
			refetchInterval: TASK_LIST_REFETCH_INTERVAL,
		});
	const { data: members } =
		cloudTrpc.organization.listMembers.useQuery(undefined);

	const task: TaskDetailRecord | null = useMemo(() => {
		if (!taskRecord) return null;
		const status = statuses?.find((entry) => entry.id === taskRecord.statusId);
		if (!status) return null;
		const findMember = (userId: string | null) =>
			userId
				? (members?.find((member) => member.user.id === userId)?.user ?? null)
				: null;
		return {
			...taskRecord,
			status,
			assignee: findMember(taskRecord.assigneeId),
			creator: findMember(taskRecord.creatorId),
		};
	}, [taskRecord, statuses, members]);

	const isTaskLoading = !task && (isTaskPending || areStatusesPending);

	const handleBack = () => {
		navigate({ to: "/tasks", search: backSearch });
	};

	const handleSaveTitle = (title: string) => {
		if (!task) return;
		taskActions.updateTitle(task.id, title);
	};

	const handleSaveDescription = (markdown: string) => {
		if (!task) return;
		taskActions.updateDescription(task.id, markdown);
	};

	const handleDelete = () => {
		navigate({ to: "/tasks", search: backSearch });
	};
	const creatorName = task?.creator?.name?.trim() ? task.creator.name : null;

	if (!task) {
		if (isTaskLoading) {
			return (
				<div className="flex-1 flex items-center justify-center">
					<span className="text-muted-foreground">
						<Trans>Loading task...</Trans>
					</span>
				</div>
			);
		}

		return (
			<div className="flex-1 flex items-center justify-center">
				<span className="text-muted-foreground">
					<Trans>Task not found</Trans>
				</span>
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

						<MarkdownEditor
							content={task.description ?? ""}
							onSave={handleSaveDescription}
						/>

						{creatorName ? (
							<>
								<Separator className="my-8" />

								<h2 className="text-lg font-semibold mb-4">
									<Trans>Activity</Trans>
								</h2>

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
