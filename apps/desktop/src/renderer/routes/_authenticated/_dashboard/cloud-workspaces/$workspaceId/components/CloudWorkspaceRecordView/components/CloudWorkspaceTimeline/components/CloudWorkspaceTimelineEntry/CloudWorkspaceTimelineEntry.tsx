import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { HiOutlineCube } from "react-icons/hi2";
import {
	LuArchive,
	LuArchiveRestore,
	LuFileText,
	LuGitPullRequest,
	LuLink2,
	LuLogIn,
	LuPencil,
	LuPlus,
	LuTag,
	LuUnlink2,
	LuUsers,
} from "react-icons/lu";
import { CloudTaskIcon } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskIcon";
import { CloudWorkspaceLabelDot } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceLabelDot";
import { PullRequestLink } from "renderer/routes/_authenticated/_dashboard/components/PullRequestLink";
import { RecordInlineLink } from "renderer/routes/_authenticated/_dashboard/components/RecordInlineLink";
import {
	ProjectGlyph,
	TaskProjectIcon,
} from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import { TimelineActor } from "renderer/routes/_authenticated/_dashboard/components/TimelineActor";
import { TimelineItem } from "renderer/routes/_authenticated/_dashboard/components/TimelineItem";
import type { CloudWorkspaceTimelineEntry as Entry } from "../../../../../../types";

interface CloudWorkspaceTimelineEntryProps {
	entry: Entry;
	isLast: boolean;
	environmentName: string;
	now: Date;
	onOpenTask: (taskId: string) => void;
	onOpenPullRequest: (url: string) => void;
	onOpenPage: (pageId: string) => void;
	onOpenProject: (projectId: string) => void;
	onOpenLabel: (labelId: string) => void;
	onOpenEnvironment: () => void;
	onOpenPerson: (userId: string) => void;
}

const SYSTEM_ICON: Record<Entry["kind"], IconType> = {
	created: LuPlus,
	joined: LuLogIn,
	renamed: LuPencil,
	visibility: LuUsers,
	description_edited: LuPencil,
	project_changed: ProjectGlyph,
	label_added: LuTag,
	label_removed: LuTag,
	task_linked: LuLink2,
	task_unlinked: LuUnlink2,
	pull_request_opened: LuGitPullRequest,
	page_published: LuFileText,
	archived: LuArchive,
	unarchived: LuArchiveRestore,
};

export function CloudWorkspaceTimelineEntry({
	entry,
	isLast,
	environmentName,
	now,
	onOpenTask,
	onOpenPullRequest,
	onOpenPage,
	onOpenProject,
	onOpenLabel,
	onOpenEnvironment,
	onOpenPerson,
}: CloudWorkspaceTimelineEntryProps) {
	const actor = (
		<TimelineActor actor={entry.actor} onOpenPerson={onOpenPerson} />
	);
	let sentence: ReactNode;
	switch (entry.kind) {
		case "created": {
			const environment = (
				<RecordInlineLink
					icon={<HiOutlineCube className="size-3.5 text-muted-foreground" />}
					onClick={onOpenEnvironment}
				>
					{environmentName}
				</RecordInlineLink>
			);
			sentence = (
				<Trans>
					{actor} created the workspace from environment {environment}
				</Trans>
			);
			break;
		}
		case "joined":
			sentence = <Trans>{actor} joined</Trans>;
			break;
		case "renamed":
			sentence = (
				<Trans>
					{actor} renamed the workspace to{" "}
					<span className="font-medium">{entry.to}</span>
				</Trans>
			);
			break;
		case "visibility":
			sentence =
				entry.to === "org" ? (
					<Trans>{actor} shared the workspace with the organization</Trans>
				) : (
					<Trans>{actor} made the workspace private</Trans>
				);
			break;
		case "description_edited":
			sentence = <Trans>{actor} edited the description</Trans>;
			break;
		case "project_changed": {
			if (!entry.project) {
				sentence = <Trans>{actor} removed the project</Trans>;
				break;
			}
			const projectId = entry.project.id;
			const project = (
				<RecordInlineLink
					icon={
						<TaskProjectIcon
							icon={entry.project.icon}
							color={entry.project.color}
						/>
					}
					onClick={() => onOpenProject(projectId)}
				>
					{entry.project.name}
				</RecordInlineLink>
			);
			sentence = (
				<Trans>
					{actor} added the workspace to {project}
				</Trans>
			);
			break;
		}
		case "label_added":
		case "label_removed": {
			const labelId = entry.label.id;
			const label = (
				<RecordInlineLink
					icon={<CloudWorkspaceLabelDot color={entry.label.color} />}
					onClick={() => onOpenLabel(labelId)}
				>
					{entry.label.name}
				</RecordInlineLink>
			);
			sentence =
				entry.kind === "label_added" ? (
					<Trans>
						{actor} added the label {label}
					</Trans>
				) : (
					<Trans>
						{actor} removed the label {label}
					</Trans>
				);
			break;
		}
		case "task_linked": {
			const chip = (
				<RecordInlineLink
					icon={<CloudTaskIcon task={entry.task} />}
					onClick={() => onOpenTask(entry.task.id)}
				>
					<span className="font-normal text-muted-foreground">
						{entry.task.slug}
					</span>{" "}
					{entry.task.title}
				</RecordInlineLink>
			);
			const suggestedBy = entry.suggestedBy?.name;
			sentence = suggestedBy ? (
				<Trans>
					{actor} linked {chip} · suggested by {suggestedBy}
				</Trans>
			) : (
				<Trans>
					{actor} linked {chip}
				</Trans>
			);
			break;
		}
		case "task_unlinked": {
			const chip = (
				<RecordInlineLink
					icon={<CloudTaskIcon task={entry.task} />}
					onClick={() => onOpenTask(entry.task.id)}
				>
					<span className="font-normal text-muted-foreground">
						{entry.task.slug}
					</span>{" "}
					{entry.task.title}
				</RecordInlineLink>
			);
			sentence = (
				<Trans>
					{actor} unlinked {chip}
				</Trans>
			);
			break;
		}
		case "pull_request_opened": {
			const badge = (
				<PullRequestLink
					number={entry.pullRequest.number}
					pullRequest={entry.pullRequest}
					onOpen={() => onOpenPullRequest(entry.pullRequest.url)}
				/>
			);
			sentence = (
				<Trans>
					{actor} opened {badge}
				</Trans>
			);
			break;
		}
		case "page_published": {
			const chip = (
				<RecordInlineLink
					icon={<LuFileText className="size-3.5 text-muted-foreground" />}
					onClick={() => onOpenPage(entry.page.id)}
				>
					{entry.page.title}
				</RecordInlineLink>
			);
			sentence = (
				<Trans>
					{actor} published {chip}
				</Trans>
			);
			break;
		}
		case "archived":
			sentence = <Trans>{actor} archived the workspace</Trans>;
			break;
		case "unarchived":
			sentence = <Trans>{actor} unarchived the workspace</Trans>;
			break;
	}
	return (
		<TimelineItem
			actor={entry.actor}
			systemIcon={SYSTEM_ICON[entry.kind]}
			at={entry.at}
			now={now}
			isLast={isLast}
			sentence={sentence}
		/>
	);
}
