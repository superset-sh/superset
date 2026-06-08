import type { TaskPriority } from "@superset/db/enums";
import type {
	SelectTask,
	SelectTaskStatus,
	SelectUser,
	SelectV2Project,
} from "@superset/db/schema";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Separator } from "@superset/ui/separator";
import {
	HiArrowLeft,
	HiOutlineFolder,
	HiOutlineUserCircle,
} from "react-icons/hi2";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { ActivitySection } from "../ActivitySection";

const PRIORITY_LABELS: Record<TaskPriority, string> = {
	none: "No priority",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

interface TaskDetailSyncingFallbackProps {
	task: SelectTask;
	status: SelectTaskStatus | null;
	assignee: SelectUser | null;
	creator: SelectUser | null;
	project: SelectV2Project | null;
	onBack: () => void;
}

export function TaskDetailSyncingFallback({
	task,
	status,
	assignee,
	creator,
	project,
	onBack,
}: TaskDetailSyncingFallbackProps) {
	const labels = task.labels ?? [];
	const statusType = status?.type ?? "backlog";
	const creatorName = creator?.name?.trim() ? creator.name : null;

	return (
		<div className="flex-1 flex min-h-0">
			<div className="flex-1 flex flex-col min-h-0 min-w-0">
				<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={onBack}
						aria-label="Back to tasks"
					>
						<HiArrowLeft className="w-4 h-4" />
					</Button>
					<span className="text-sm text-muted-foreground">{task.slug}</span>
					<Badge variant="outline" className="ml-auto text-xs font-normal">
						Syncing local task data
					</Badge>
				</div>

				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 py-6 max-w-4xl">
						<h1 className="mb-6 text-2xl font-semibold">{task.title}</h1>

						{task.description?.trim() ? (
							<MarkdownRenderer
								content={task.description}
								className="min-h-[100px]"
							/>
						) : (
							<p className="text-sm text-muted-foreground">No description</p>
						)}

						{creatorName ? (
							<>
								<Separator className="my-8" />

								<h2 className="text-lg font-semibold mb-4">Activity</h2>

								<ActivitySection
									createdAt={new Date(task.createdAt)}
									creatorName={creatorName}
									creatorAvatarUrl={creator?.image}
								/>
							</>
						) : null}
					</div>
				</ScrollArea>
			</div>

			<div className="w-64 border-l border-border shrink-0">
				<ScrollArea className="h-full">
					<div className="p-4 space-y-6">
						<div className="space-y-1">
							<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Properties
							</h3>
							<p className="text-xs text-muted-foreground">
								Editing unlocks after local sync finishes.
							</p>
						</div>

						<div className="space-y-3">
							<div className="flex items-center gap-2 px-1 py-0.5">
								{status ? (
									<>
										<StatusIcon
											type={status.type as StatusType}
											color={status.color}
											progress={status.progressPercent ?? undefined}
										/>
										<span className="text-sm">{status.name}</span>
									</>
								) : (
									<span className="text-sm text-muted-foreground">
										Syncing status...
									</span>
								)}
							</div>

							<div className="flex items-center gap-2 px-1 py-0.5">
								<PriorityIcon
									priority={task.priority}
									statusType={statusType}
								/>
								<span className="text-sm">
									{PRIORITY_LABELS[task.priority]}
								</span>
							</div>

							<div className="flex items-center gap-2 px-1 py-0.5">
								{assignee ? (
									<>
										{assignee.image ? (
											<img
												src={assignee.image}
												alt=""
												className="w-5 h-5 rounded-full"
											/>
										) : (
											<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
												{assignee.name?.charAt(0).toUpperCase() ?? "?"}
											</div>
										)}
										<span className="text-sm">{assignee.name}</span>
									</>
								) : task.assigneeExternalId ? (
									<>
										{task.assigneeAvatarUrl ? (
											<img
												src={task.assigneeAvatarUrl}
												alt=""
												className="w-5 h-5 rounded-full"
											/>
										) : (
											<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs">
												{task.assigneeDisplayName?.charAt(0).toUpperCase() ??
													"?"}
											</div>
										)}
										<span className="text-sm">
											{task.assigneeDisplayName || "External"}{" "}
											<span className="text-muted-foreground">(external)</span>
										</span>
									</>
								) : (
									<>
										<HiOutlineUserCircle className="w-5 h-5 text-muted-foreground" />
										<span className="text-sm text-muted-foreground">
											Unassigned
										</span>
									</>
								)}
							</div>

							<div className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left">
								{project ? (
									<ProjectThumbnail
										projectName={project.name}
										iconUrl={project.iconUrl}
										className="size-4 rounded-[3px]"
									/>
								) : (
									<HiOutlineFolder className="size-4 text-muted-foreground" />
								)}
								<span className="min-w-0 flex-1 truncate text-sm">
									{project?.name ?? "No project"}
								</span>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-xs text-muted-foreground">Labels</span>
							{labels.length > 0 ? (
								<div className="flex flex-wrap gap-1">
									{labels.map((label) => (
										<Badge key={label} variant="outline" className="text-xs">
											{label}
										</Badge>
									))}
								</div>
							) : (
								<span className="text-sm text-muted-foreground">No labels</span>
							)}
						</div>
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}
