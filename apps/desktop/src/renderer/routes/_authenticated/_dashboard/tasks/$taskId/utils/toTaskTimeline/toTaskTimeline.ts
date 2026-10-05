import type { TimelineActorValue } from "renderer/routes/_authenticated/_dashboard/components/TimelineActor";
import type {
	TaskComment,
	TaskCommentThread,
	TaskTimeline,
	TaskTimelineEvent,
	TaskTimelineItem,
} from "../../types";

const COLLAPSE_WITHIN_MS = 60_000;
const DESCRIPTION_COLLAPSE_WITHIN_MS = 15 * 60_000;

const toActor = (
	person: { userId: string; name: string; image: string | null } | null,
): TimelineActorValue =>
	person ? { kind: "user", person } : { kind: "system" };

/** Events and comment threads, oldest first; threads sit where their first comment was posted. */
export function toTaskTimeline(timeline: TaskTimeline): TaskTimelineItem[] {
	const events: TaskTimelineEvent[] = [
		{
			id: "created",
			at: timeline.created.at,
			actor: toActor(timeline.created.actor),
			kind: "created" as const,
			importedFrom: timeline.created.importedFrom,
		},
		...timeline.changes.flatMap((change): TaskTimelineEvent[] => {
			const base = {
				id: change.id,
				at: change.at,
				actor: toActor(change.actor),
			};
			const out: TaskTimelineEvent[] = [];
			if (change.title) out.push({ ...base, kind: "renamed", ...change.title });
			if (change.descriptionEdited)
				out.push({ ...base, kind: "description_edited" });
			for (const label of change.addedLabels)
				out.push({
					...base,
					id: `${change.id}:${label.id}`,
					kind: "label_added",
					label,
				});
			for (const label of change.removedLabels)
				out.push({
					...base,
					id: `${change.id}:${label.id}`,
					kind: "label_removed",
					label,
				});
			if (change.status)
				out.push({ ...base, kind: "status", ...change.status });
			if (change.priority)
				out.push({ ...base, kind: "priority", ...change.priority });
			if (change.assignee)
				out.push({ ...base, kind: "assignee", ...change.assignee });
			if (change.project)
				out.push({ ...base, kind: "project", ...change.project });
			return out;
		}),
		...timeline.workspaceLinks.map(
			(link): TaskTimelineEvent => ({
				id: link.id,
				at: link.at,
				actor: toActor(link.actor),
				kind:
					link.kind === "linked" ? "workspace_linked" : "workspace_unlinked",
				workspace: link.workspace,
			}),
		),
	].sort((left, right) => left.at.getTime() - right.at.getTime());

	const items: TaskTimelineItem[] = [
		...collapse(events).map((event) => ({ kind: "event" as const, event })),
		...toThreads(timeline.comments).map((thread) => ({
			kind: "thread" as const,
			thread,
		})),
	];
	return items.sort((left, right) => itemAt(left) - itemAt(right));
}

const itemAt = (item: TaskTimelineItem) =>
	(item.kind === "event" ? item.event.at : item.thread.root.at).getTime();

function toThreads(comments: TaskComment[]): TaskCommentThread[] {
	const roots = new Map<string, TaskCommentThread>();
	for (const comment of comments) {
		if (!comment.parentCommentId) {
			roots.set(comment.id, { root: comment, replies: [] });
		}
	}
	for (const comment of comments) {
		if (!comment.parentCommentId) continue;
		const thread = roots.get(comment.parentCommentId);
		if (thread) thread.replies.push(comment);
		else roots.set(comment.id, { root: comment, replies: [] });
	}
	return [...roots.values()];
}

const actorKey = (event: TaskTimelineEvent) =>
	event.actor.kind === "user" ? event.actor.person.userId : "system";

/** The same change by the same person moments apart reads as one, and one undone moments later as none. */
function collapse(events: TaskTimelineEvent[]): TaskTimelineEvent[] {
	const kept: TaskTimelineEvent[] = [];
	for (const event of events) {
		const window =
			event.kind === "description_edited"
				? DESCRIPTION_COLLAPSE_WITHIN_MS
				: COLLAPSE_WITHIN_MS;
		const index = kept.findLastIndex(
			(previous) =>
				previous.kind === event.kind &&
				actorKey(previous) === actorKey(event) &&
				event.at.getTime() - previous.at.getTime() <= window,
		);
		const previous = kept[index];
		if (previous?.kind === "description_edited") {
			kept.splice(index, 1, event);
			continue;
		}
		if (!previous || !isFieldChange(previous) || !isFieldChange(event)) {
			kept.push(event);
			continue;
		}
		kept.splice(index, 1);
		const merged = { ...event, from: previous.from } as TaskTimelineEvent;
		if (!cancelsOut(merged)) kept.push(merged);
	}
	return kept;
}

type FieldChange = Extract<
	TaskTimelineEvent,
	{ kind: "renamed" | "status" | "priority" | "assignee" | "project" }
>;

const isFieldChange = (event: TaskTimelineEvent): event is FieldChange =>
	event.kind === "renamed" ||
	event.kind === "status" ||
	event.kind === "priority" ||
	event.kind === "assignee" ||
	event.kind === "project";

function cancelsOut(event: TaskTimelineEvent): boolean {
	switch (event.kind) {
		case "renamed":
		case "priority":
			return event.from === event.to;
		case "status":
		case "project":
			return (event.from?.id ?? null) === (event.to?.id ?? null);
		case "assignee":
			return (event.from?.userId ?? null) === (event.to?.userId ?? null);
		default:
			return false;
	}
}
