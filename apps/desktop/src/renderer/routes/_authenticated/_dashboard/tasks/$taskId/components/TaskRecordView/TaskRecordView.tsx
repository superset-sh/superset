import { Trans } from "@lingui/react/macro";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { DescriptionEditor } from "renderer/routes/_authenticated/_dashboard/components/DescriptionEditor";
import type { RecordLabel } from "renderer/routes/_authenticated/_dashboard/components/RecordLabels";
import { RecordLayout } from "renderer/routes/_authenticated/_dashboard/components/RecordLayout";
import { RecordSection } from "renderer/routes/_authenticated/_dashboard/components/RecordSection";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import type {
	NewTaskComment,
	TaskPerson,
	TaskProjectValue,
	TaskRecord,
	TaskTimelineItem,
} from "../../types";
import { TaskRecordActions } from "./components/TaskRecordActions";
import { TaskRecordHeader } from "./components/TaskRecordHeader";
import { TaskRecordSide } from "./components/TaskRecordSide";
import { TaskRecordTopBar } from "./components/TaskRecordTopBar";
import { TaskTimeline } from "./components/TaskTimeline";

interface TaskRecordViewProps {
	task: TaskRecord;
	now: Date;
	timeline: TaskTimelineItem[];
	currentUser: TaskPerson | null;
	project: TaskProjectValue | null;
	projects: TaskProjectValue[];
	workspaces: CloudWorkspaceRow[];
	pullRequests: CloudPullRequest[];
	labels: RecordLabel[];
	knownLabels: RecordLabel[];
	onAddLabel: (name: string) => void;
	onRemoveLabel: (labelId: string) => void;
	onBack: () => void;
	onRename: (title: string) => void;
	onSaveDescription: (description: string | null) => void;
	onCopyLink: () => void;
	onCopyId: () => void;
	onOpenExternal?: () => void;
	onDelete: () => void;
	onSetProject: (projectId: string | null) => void;
	onCreateProject: (name: string) => void;
	onOpenPerson: (userId: string) => void;
	onOpenProject: (projectId: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onOpenPullRequest: (url: string) => void;
	onAddComment: (comment: NewTaskComment) => Promise<void>;
	onEditComment: (commentId: string, body: string) => Promise<void>;
	onDeleteComment: (commentId: string) => void;
}

export function TaskRecordView({
	task,
	now,
	timeline,
	currentUser,
	project,
	projects,
	workspaces,
	pullRequests,
	labels,
	knownLabels,
	onAddLabel,
	onRemoveLabel,
	onBack,
	onRename,
	onSaveDescription,
	onCopyLink,
	onCopyId,
	onOpenExternal,
	onDelete,
	onSetProject,
	onCreateProject,
	onOpenPerson,
	onOpenProject,
	onOpenWorkspace,
	onOpenPullRequest,
	onAddComment,
	onEditComment,
	onDeleteComment,
}: TaskRecordViewProps) {
	return (
		<RecordLayout
			header={<TaskRecordTopBar slug={task.slug} onBack={onBack} />}
			sideActions={
				<TaskRecordActions
					task={task}
					onCopyLink={onCopyLink}
					onCopyId={onCopyId}
					onOpenExternal={onOpenExternal}
					onDelete={onDelete}
				/>
			}
			side={
				<TaskRecordSide
					task={task}
					now={now}
					project={project}
					projects={projects}
					workspaces={workspaces}
					pullRequests={pullRequests}
					labels={labels}
					knownLabels={knownLabels}
					onAddLabel={onAddLabel}
					onRemoveLabel={onRemoveLabel}
					onSetProject={onSetProject}
					onCreateProject={onCreateProject}
					onOpenWorkspace={onOpenWorkspace}
					onOpenPullRequest={onOpenPullRequest}
				/>
			}
		>
			<TaskRecordHeader
				task={task}
				now={now}
				onOpenPerson={onOpenPerson}
				onRename={onRename}
			/>
			<div className="mt-6 max-w-[760px]">
				<DescriptionEditor
					allowAttachments
					key={task.id}
					description={task.description}
					onSave={onSaveDescription}
				/>
			</div>
			<RecordSection title={<Trans>Activity</Trans>}>
				<TaskTimeline
					items={timeline}
					now={now}
					currentUser={currentUser}
					onOpenPerson={onOpenPerson}
					onOpenProject={onOpenProject}
					onOpenWorkspace={onOpenWorkspace}
					onAddComment={onAddComment}
					onEditComment={onEditComment}
					onDeleteComment={onDeleteComment}
				/>
			</RecordSection>
		</RecordLayout>
	);
}
