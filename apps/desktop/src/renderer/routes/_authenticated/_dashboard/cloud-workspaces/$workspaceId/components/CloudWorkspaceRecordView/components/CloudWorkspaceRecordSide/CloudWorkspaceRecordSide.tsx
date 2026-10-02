import { Trans } from "@lingui/react/macro";
import { HiOutlineCube } from "react-icons/hi2";
import { CloudPullRequestRow } from "renderer/routes/_authenticated/_dashboard/components/CloudPullRequestRow";
import { CloudRepositoryRow } from "renderer/routes/_authenticated/_dashboard/components/CloudRepositoryRow";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import { CloudWorkspacePersonLink } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePersonLink";
import { LinkedTaskRow } from "renderer/routes/_authenticated/_dashboard/components/LinkedTaskRow";
import { ProjectPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectPicker";
import { PropertyRow } from "renderer/routes/_authenticated/_dashboard/components/PropertyRow";
import {
	type RecordLabel,
	RecordLabels,
} from "renderer/routes/_authenticated/_dashboard/components/RecordLabels";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import type {
	CloudWorkspaceRecord,
	CloudWorkspaceRecordPage,
	CloudWorkspaceRecordProject,
} from "../../../../types";
import { CloudWorkspacePageCard } from "./components/CloudWorkspacePageCard";

interface CloudWorkspaceRecordSideProps {
	workspace: CloudWorkspaceRecord;
	tasks: CloudTask[];
	pullRequests: CloudPullRequest[];
	pages: CloudWorkspaceRecordPage[];
	projects: CloudWorkspaceRecordProject[];
	now: Date;
	onOpenRepository: (fullName: string) => void;
	onOpenTask: (taskId: string) => void;
	onUnlinkTask: (taskId: string) => void;
	onOpenPullRequest: (url: string) => void;
	onOpenPage: (pageId: string) => void;
	onOpenPerson: (userId: string) => void;
	onSetProject: (projectId: string | null) => void;
	onCreateProject: (name: string) => void;
	labels: RecordLabel[];
	knownLabels: RecordLabel[];
	onAddLabel: (name: string) => void;
	onRemoveLabel: (labelId: string) => void;
	onOpenEnvironment: () => void;
}

export function CloudWorkspaceRecordSide({
	workspace,
	tasks,
	pullRequests,
	pages,
	projects,
	now,
	onOpenRepository,
	onOpenTask,
	onUnlinkTask,
	onOpenPullRequest,
	onOpenPage,
	onOpenPerson,
	onSetProject,
	onCreateProject,
	labels,
	knownLabels,
	onAddLabel,
	onRemoveLabel,
	onOpenEnvironment,
}: CloudWorkspaceRecordSideProps) {
	const owner = workspace.createdBy;
	return (
		<aside className="space-y-4 px-3 py-[18px] text-[13px]">
			<CloudSection title={<Trans>Properties</Trans>}>
				{owner && (
					<PropertyRow label={<Trans>Created by</Trans>}>
						<CloudWorkspacePersonLink
							person={owner}
							className="-mx-1 h-6"
							onOpen={onOpenPerson}
						/>
					</PropertyRow>
				)}
				<PropertyRow label={<Trans>Environment</Trans>}>
					<button
						type="button"
						onClick={onOpenEnvironment}
						className="-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none"
					>
						<HiOutlineCube className="size-3.5 text-muted-foreground" />
						{workspace.environmentName}
					</button>
				</PropertyRow>
				<PropertyRow label={<Trans>Project</Trans>}>
					<ProjectPicker
						project={workspace.project}
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
			{workspace.repositories.length > 0 && (
				<CloudSection title={<Trans>Repositories</Trans>}>
					{workspace.repositories.map((repository) => (
						<CloudRepositoryRow
							key={repository.fullName}
							fullName={repository.fullName}
							onOpen={() => onOpenRepository(repository.fullName)}
						/>
					))}
				</CloudSection>
			)}
			{tasks.length > 0 && (
				<CloudSection title={<Trans>Tasks</Trans>}>
					{tasks.map((task) => (
						<LinkedTaskRow
							key={task.id}
							task={task}
							onOpen={() => onOpenTask(task.id)}
							onUnlink={() => onUnlinkTask(task.id)}
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
			{pages.length > 0 && (
				<CloudSection title={<Trans>Pages</Trans>}>
					<div className="grid grid-cols-2 gap-2.5 px-2 pt-1">
						{pages.map((page) => (
							<CloudWorkspacePageCard
								key={page.id}
								page={page}
								now={now}
								onOpen={() => onOpenPage(page.id)}
							/>
						))}
					</div>
				</CloudSection>
			)}
		</aside>
	);
}
