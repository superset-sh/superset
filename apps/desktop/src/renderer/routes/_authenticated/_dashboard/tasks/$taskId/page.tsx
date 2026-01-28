import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Separator } from "@superset/ui/separator";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TaskWithStatus } from "../components/TasksView/hooks/useTasksTable";
import { ActivitySection } from "./components/ActivitySection";
import { CommentInput } from "./components/CommentInput";
import { EditableTitle } from "./components/EditableTitle";
import { PropertiesSidebar } from "./components/PropertiesSidebar";
import { TaskMarkdownRenderer } from "./components/TaskMarkdownRenderer";
import { useEscapeToNavigate } from "./hooks/useEscapeToNavigate";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/$taskId/",
)({
	component: TaskDetailPage,
});

function TaskDetailPage() {
	const { taskId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();

	useEscapeToNavigate("/tasks");

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
				.where(({ tasks }) => eq(tasks.id, taskId)),
		[collections, taskId],
	);

	const task: TaskWithStatus | null = useMemo(() => {
		if (!taskData || taskData.length === 0) return null;
		return taskData[0];
	}, [taskData]);

	const handleBack = () => {
		navigate({ to: "/tasks" });
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

	if (!task) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<span className="text-muted-foreground">Task not found</span>
			</div>
		);
	}

	return (
		<div className="flex-1 flex min-h-0">
			{/* Main content area */}
			<div className="flex-1 flex flex-col min-h-0 min-w-0">
				{/* Header */}
				<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={handleBack}
					>
						<HiArrowLeft className="w-4 h-4" />
					</Button>
					<span className="text-sm text-muted-foreground">{task.slug}</span>
					{task.externalUrl && (
						<a
							href={task.externalUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-muted-foreground hover:text-foreground transition-colors"
							title="Open in Linear"
						>
							<LuExternalLink className="w-4 h-4" />
						</a>
					)}
				</div>

				{/* Content */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 py-6 max-w-4xl">
						<EditableTitle value={task.title} onSave={handleSaveTitle} />

						<TaskMarkdownRenderer
							content={task.description ?? ""}
							onSave={handleSaveDescription}
						/>

						<Separator className="my-8" />

						<h2 className="text-lg font-semibold mb-4">Activity</h2>

						<ActivitySection
							createdAt={new Date(task.createdAt)}
							creatorName={task.assignee?.name ?? "Someone"}
							creatorAvatarUrl={task.assignee?.image}
						/>

						<div className="mt-6">
							<CommentInput />
						</div>
					</div>
				</ScrollArea>
			</div>

			<PropertiesSidebar task={task} />
		</div>
	);
}
