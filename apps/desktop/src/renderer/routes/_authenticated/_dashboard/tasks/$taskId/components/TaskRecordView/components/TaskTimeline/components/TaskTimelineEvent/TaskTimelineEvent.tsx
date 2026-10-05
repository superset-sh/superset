import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
	LuBox,
	LuCircleDot,
	LuLink2,
	LuPencil,
	LuPlus,
	LuSignal,
	LuTag,
	LuUnlink2,
	LuUserRound,
} from "react-icons/lu";
import { CloudWorkspaceLabelDot } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceLabelDot";
import { CloudWorkspacePersonLink } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePersonLink";
import { RecordInlineLink } from "renderer/routes/_authenticated/_dashboard/components/RecordInlineLink";
import {
	ProjectGlyph,
	TaskProjectIcon,
} from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import { TimelineActor } from "renderer/routes/_authenticated/_dashboard/components/TimelineActor";
import { TimelineItem } from "renderer/routes/_authenticated/_dashboard/components/TimelineItem";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { usePriorityLabels } from "renderer/routes/_authenticated/_dashboard/tasks/hooks/usePriorityLabels";
import type {
	TaskTimelineEvent as Event,
	TaskProjectValue,
} from "../../../../../../types";

interface TaskTimelineEventProps {
	event: Event;
	isLast: boolean;
	now: Date;
	onOpenPerson: (userId: string) => void;
	onOpenProject: (projectId: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
}

const SYSTEM_ICON: Record<Event["kind"], IconType> = {
	created: LuPlus,
	renamed: LuPencil,
	description_edited: LuPencil,
	label_added: LuTag,
	label_removed: LuTag,
	status: LuCircleDot,
	priority: LuSignal,
	assignee: LuUserRound,
	project: ProjectGlyph,
	workspace_linked: LuLink2,
	workspace_unlinked: LuUnlink2,
};

export function TaskTimelineEvent({
	event,
	isLast,
	now,
	onOpenPerson,
	onOpenProject,
	onOpenWorkspace,
}: TaskTimelineEventProps) {
	const priorityLabels = usePriorityLabels();
	const actor = (
		<TimelineActor actor={event.actor} onOpenPerson={onOpenPerson} />
	);
	const strong = (text: string) => (
		<span className="font-medium text-foreground">{text}</span>
	);
	const status = (
		value: NonNullable<Extract<Event, { kind: "status" }>["to"]>,
	) => (
		<span className="inline-flex items-center gap-1 font-medium text-foreground">
			<StatusIcon
				type={value.type as StatusType}
				color={value.color}
				progress={value.progressPercent ?? undefined}
			/>
			{value.name}
		</span>
	);
	const person = (value: {
		userId: string;
		name: string;
		image: string | null;
	}) => (
		<CloudWorkspacePersonLink
			person={value}
			showAvatar={false}
			className="text-inherit"
			onOpen={onOpenPerson}
		/>
	);
	const project = (value: TaskProjectValue) => (
		<RecordInlineLink
			icon={<TaskProjectIcon icon={value.icon} color={value.color} />}
			onClick={() => onOpenProject(value.id)}
		>
			{value.name}
		</RecordInlineLink>
	);

	let sentence: ReactNode;
	switch (event.kind) {
		case "created":
			sentence =
				event.importedFrom === "linear" ? (
					<Trans>Imported from Linear</Trans>
				) : (
					<Trans>{actor} created the task</Trans>
				);
			break;
		case "renamed": {
			const title = strong(event.to);
			sentence = (
				<Trans>
					{actor} renamed the task to {title}
				</Trans>
			);
			break;
		}
		case "label_added":
		case "label_removed": {
			const label = (
				<span className="inline-flex items-center gap-1 font-medium text-foreground">
					<CloudWorkspaceLabelDot color={event.label.color} />
					{event.label.name}
				</span>
			);
			sentence =
				event.kind === "label_added" ? (
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
		case "description_edited":
			sentence = <Trans>{actor} edited the description</Trans>;
			break;
		case "status": {
			if (!event.to) {
				sentence = <Trans>{actor} cleared the status</Trans>;
				break;
			}
			const to = status(event.to);
			if (event.from) {
				const from = status(event.from);
				sentence = (
					<Trans>
						{actor} moved the task from {from} to {to}
					</Trans>
				);
			} else {
				sentence = (
					<Trans>
						{actor} set the status to {to}
					</Trans>
				);
			}
			break;
		}
		case "priority": {
			const to = strong(priorityLabels[event.to]);
			if (event.to === "none") {
				sentence = <Trans>{actor} removed the priority</Trans>;
			} else if (event.from && event.from !== "none") {
				const from = strong(priorityLabels[event.from]);
				sentence = (
					<Trans>
						{actor} changed the priority from {from} to {to}
					</Trans>
				);
			} else {
				sentence = (
					<Trans>
						{actor} set the priority to {to}
					</Trans>
				);
			}
			break;
		}
		case "assignee": {
			if (!event.to) {
				const from = event.from ? person(event.from) : null;
				sentence = from ? (
					<Trans>
						{actor} unassigned {from}
					</Trans>
				) : (
					<Trans>{actor} removed the assignee</Trans>
				);
				break;
			}
			const isSelf =
				event.actor.kind === "user" &&
				event.actor.person.userId === event.to.userId;
			const to = person(event.to);
			sentence = isSelf ? (
				<Trans>{actor} assigned themselves</Trans>
			) : (
				<Trans>
					{actor} assigned the task to {to}
				</Trans>
			);
			break;
		}
		case "project": {
			if (!event.to) {
				const from = event.from ? project(event.from) : null;
				sentence = from ? (
					<Trans>
						{actor} removed the task from {from}
					</Trans>
				) : (
					<Trans>{actor} removed the project</Trans>
				);
				break;
			}
			const to = project(event.to);
			sentence = (
				<Trans>
					{actor} added the task to {to}
				</Trans>
			);
			break;
		}
		case "workspace_linked":
		case "workspace_unlinked": {
			const workspace = (
				<RecordInlineLink
					icon={<LuBox className="size-3.5 text-muted-foreground" />}
					onClick={() => onOpenWorkspace(event.workspace.id)}
				>
					{event.workspace.name}
				</RecordInlineLink>
			);
			sentence =
				event.kind === "workspace_linked" ? (
					<Trans>
						{actor} linked the workspace {workspace}
					</Trans>
				) : (
					<Trans>
						{actor} unlinked the workspace {workspace}
					</Trans>
				);
			break;
		}
	}
	return (
		<TimelineItem
			actor={event.actor}
			systemIcon={SYSTEM_ICON[event.kind]}
			at={event.at}
			now={now}
			isLast={isLast}
			sentence={sentence}
		/>
	);
}
