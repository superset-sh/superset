import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import { CloudWorkspacesList } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacesList";
import type { CloudWorkspaceListItem } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacesList/components/CloudWorkspaceListRow";
import { CreateTaskDialog } from "renderer/routes/_authenticated/_dashboard/components/CreateTaskDialog";
import type { ProjectRecord } from "../../../../types";
import { ProjectTaskList } from "./components/ProjectTaskList";

interface ProjectProgressTabProps {
	project: ProjectRecord;
	now: Date;
	onAddTask: (task: { id: string; slug: string; title: string }) => void;
	onOpenTask: (taskId: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	workspaceItems: CloudWorkspaceListItem[];
	onOpenPullRequest: (url: string) => void;
	onOpenRepo: (fullName: string) => void;
	onSetInSidebar: (workspaceId: string, inSidebar: boolean) => void;
}

export function ProjectProgressTab({
	project,
	now,
	onAddTask,
	onOpenTask,
	onOpenWorkspace,
	workspaceItems,
	onOpenPullRequest,
	onOpenRepo,
	onSetInSidebar,
}: ProjectProgressTabProps) {
	const [isCreateTaskOpen, setCreateTaskOpen] = useState(false);
	return (
		<div className="flex max-w-[760px] flex-col gap-8">
			<div>
				<div className="flex items-center justify-between">
					<span className="px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
						<Trans>Tasks</Trans>
					</span>
					<button
						type="button"
						onClick={() => setCreateTaskOpen(true)}
						className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuPlus className="size-3.5" />
						<Trans>Add task</Trans>
					</button>
					<CreateTaskDialog
						open={isCreateTaskOpen}
						onOpenChange={setCreateTaskOpen}
						onCreated={onAddTask}
					/>
				</div>
				{project.tasks.length === 0 ? (
					<p className="px-2 pt-2 text-sm text-muted-foreground">
						<Trans>No tasks in this project yet.</Trans>
					</p>
				) : (
					<ProjectTaskList tasks={project.tasks} onOpenTask={onOpenTask} />
				)}
			</div>
			<CloudSection title={<Trans>Workspaces</Trans>}>
				{workspaceItems.length === 0 ? (
					<p className="px-2 text-sm text-muted-foreground">
						<Trans>No workspaces in this project yet.</Trans>
					</p>
				) : (
					<CloudWorkspacesList
						content={{ items: workspaceItems }}
						now={now}
						onOpen={onOpenWorkspace}
						onOpenPullRequest={onOpenPullRequest}
						onOpenRepo={onOpenRepo}
						onSetInSidebar={onSetInSidebar}
					/>
				)}
			</CloudSection>
		</div>
	);
}
