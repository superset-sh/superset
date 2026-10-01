import type { RouterOutputs } from "@superset/trpc";
import type { CloudWorkspaceTimelineEntry } from "../../types";

type ActivityRow = RouterOutputs["cloudWorkspace"]["activity"][number];

const COLLAPSE_WITHIN_MS = 60_000;
const DESCRIPTION_COLLAPSE_WITHIN_MS = 15 * 60_000;

/**
 * One timeline entry per activity row; a row the page can't render yet is
 * skipped. Rows are oldest first.
 */
export function toTimelineEntries(
	rows: ActivityRow[],
): CloudWorkspaceTimelineEntry[] {
	return collapse(
		rows.flatMap((row): CloudWorkspaceTimelineEntry[] => {
			const base = { id: row.id, at: row.at, actor: row.actor };
			switch (row.event) {
				case "created":
				case "joined":
				case "archived":
				case "unarchived":
					return [{ ...base, kind: row.event }];
				case "description_edited":
					return [{ ...base, kind: "description_edited" }];
				case "run_finished":
				case "run_failed":
					return [];
			}
			if (row.toName !== null) {
				return [
					{
						...base,
						kind: "renamed",
						from: row.fromName ?? "",
						to: row.toName,
					},
				];
			}
			if (row.toVisibility !== null) {
				return [
					{
						...base,
						kind: "visibility",
						from: row.fromVisibility,
						to: row.toVisibility,
					},
				];
			}
			if (row.linkedTask) {
				return [
					{
						...base,
						kind: "task_linked",
						task: row.linkedTask,
						suggestedBy: row.suggestedBy,
					},
				];
			}
			if (row.unlinkedTask) {
				return [{ ...base, kind: "task_unlinked", task: row.unlinkedTask }];
			}
			if (row.page) {
				return [{ ...base, kind: "page_published", page: row.page }];
			}
			if (row.addedLabels.length > 0 || row.removedLabels.length > 0) {
				return [
					...row.addedLabels.map((label) => ({
						...base,
						id: `${row.id}:${label.id}`,
						kind: "label_added" as const,
						label,
					})),
					...row.removedLabels.map((label) => ({
						...base,
						id: `${row.id}:${label.id}`,
						kind: "label_removed" as const,
						label,
					})),
				];
			}
			if (row.fromProject || row.toProject) {
				return [
					{
						...base,
						kind: "project_changed",
						from: row.fromProject,
						project: row.toProject,
					},
				];
			}
			return [];
		}),
	);
}

const actorKey = (entry: CloudWorkspaceTimelineEntry) =>
	entry.actor.kind === "user" ? entry.actor.person.userId : "system";

/** The same change by the same person moments apart reads as one change, and a change undone moments later as none. */
function collapse(
	entries: CloudWorkspaceTimelineEntry[],
): CloudWorkspaceTimelineEntry[] {
	const kept: CloudWorkspaceTimelineEntry[] = [];
	for (const entry of entries) {
		const previous = kept.at(-1);
		const merged =
			previous &&
			actorKey(previous) === actorKey(entry) &&
			entry.at.getTime() - previous.at.getTime() <=
				(entry.kind === "description_edited"
					? DESCRIPTION_COLLAPSE_WITHIN_MS
					: COLLAPSE_WITHIN_MS)
				? merge(previous, entry)
				: undefined;
		if (merged === undefined) {
			kept.push(entry);
			continue;
		}
		kept.pop();
		if (merged !== null) kept.push(merged);
	}
	return kept;
}

const isLabelChange = (entry: CloudWorkspaceTimelineEntry) =>
	entry.kind === "label_added" || entry.kind === "label_removed";

/** The two entries as one, null when they cancel out, undefined when they don't combine. */
function merge(
	previous: CloudWorkspaceTimelineEntry,
	next: CloudWorkspaceTimelineEntry,
): CloudWorkspaceTimelineEntry | null | undefined {
	if (
		previous.kind === "description_edited" &&
		next.kind === "description_edited"
	) {
		return next;
	}
	if (previous.kind === "renamed" && next.kind === "renamed") {
		return previous.from === next.to ? null : { ...next, from: previous.from };
	}
	if (previous.kind === "visibility" && next.kind === "visibility") {
		return previous.from === next.to ? null : { ...next, from: previous.from };
	}
	if (previous.kind === "project_changed" && next.kind === "project_changed") {
		return (previous.from?.id ?? null) === (next.project?.id ?? null)
			? null
			: { ...next, from: previous.from };
	}
	if (
		isLabelChange(previous) &&
		isLabelChange(next) &&
		previous.kind !== next.kind &&
		"label" in previous &&
		"label" in next &&
		previous.label.id === next.label.id
	) {
		return null;
	}
	return undefined;
}
