import { Trans } from "@lingui/react/macro";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { CloudPullRequestRow } from "renderer/routes/_authenticated/_dashboard/components/CloudPullRequestRow";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import { ProjectPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectPicker";
import { PropertyRow } from "renderer/routes/_authenticated/_dashboard/components/PropertyRow";
import {
	type RecordLabel,
	RecordLabels,
} from "renderer/routes/_authenticated/_dashboard/components/RecordLabels";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import type { TaskProjectValue, TaskRecord } from "../../../../types";
import { AssigneeProperty } from "./components/AssigneeProperty";
import { PriorityProperty } from "./components/PriorityProperty";
import { StatusProperty } from "./components/StatusProperty";
import { TaskWorkspaceRow } from "./components/TaskWorkspaceRow";

interface TaskRecordSideProps {
	task: TaskRecord;
	now: Date;
	project: TaskProjectValue | null;
	projects: TaskProjectValue[];
	workspaces: CloudWorkspaceRow[];
	pullRequests: CloudPullRequest[];
	labels: RecordLabel[];
	knownLabels: RecordLabel[];
	onAddLabel: (name: string) => void;
	onRemoveLabel: (labelId: string) => void;
	onSetProject: (projectId: string | null) => void;
	onCreateProject: (name: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onOpenPullRequest: (url: string) => void;
}

export function TaskRecordSide({
	task,
	now,
	project,
	projects,
	workspaces,
	pullRequests,
	labels,
	knownLabels,
	onAddLabel,
	onRemoveLabel,
	onSetProject,
	onCreateProject,
	onOpenWorkspace,
	onOpenPullRequest,
}: TaskRecordSideProps) {
	return (
		<aside className="space-y-4 px-3 py-[18px] text-[13px]">
			<CloudSection title={<Trans>Properties</Trans>}>
				<PropertyRow label={<Trans>Status</Trans>}>
					<StatusProperty task={task} />
				</PropertyRow>
				<PropertyRow label={<Trans>Priority</Trans>}>
					<PriorityProperty task={task} />
				</PropertyRow>
				<PropertyRow label={<Trans>Assignee</Trans>}>
					<AssigneeProperty task={task} />
				</PropertyRow>
				<PropertyRow label={<Trans>Project</Trans>}>
					<ProjectPicker
						project={project}
						projects={projects}
						onSetProject={onSetProject}
						onCreateProject={onCreateProject}
					/>
				</PropertyRow>
			</CloudSection>
			<CloudSection title={<Trans>Labels</Trans>}>
				<div className="px-2 py-1">
					<RecordLabels
						labels={labels}
						knownLabels={knownLabels}
						onAddLabel={onAddLabel}
						onRemoveLabel={onRemoveLabel}
					/>
				</div>
			</CloudSection>
			{workspaces.length > 0 && (
				<CloudSection title={<Trans>Workspaces</Trans>}>
					{workspaces.map((workspace) => (
						<TaskWorkspaceRow
							key={workspace.id}
							workspace={workspace}
							now={now}
							onOpen={() => onOpenWorkspace(workspace.id)}
						/>
					))}
				</CloudSection>
			)}
			{pullRequests.length > 0 && (
				<CloudSection title={<Trans>Pull requests</Trans>}>
					{pullRequests.map((pullRequest) => (
						<CloudPullRequestRow
							key={pullRequest.url}
							pullRequest={pullRequest}
							onOpen={() => onOpenPullRequest(pullRequest.url)}
						/>
					))}
				</CloudSection>
			)}
		</aside>
	);
}
