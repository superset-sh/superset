import { ALL_VIEWS } from "./allViews";
import { type FileMeta, type FileView, PRIORITY_RANK } from "./types";

export function resolveViews(filePath: string, meta: FileMeta): FileView[] {
	const matches = ALL_VIEWS.filter((view) => view.match(filePath, meta));
	const exclusives = matches.filter((v) => v.priority === "exclusive");
	if (exclusives.length > 0) {
		return exclusives;
	}
	return [...matches].sort(
		(a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
	);
}

export function pickDefaultView(views: FileView[]): FileView | null {
	return views[0] ?? null;
}

// Reverse sort order so the default view (index 0) appears on the right of the toggle,
// closest to the editor surface. Matches Cursor's Preview · Markdown layout.
export function orderForToggle(views: FileView[]): FileView[] {
	return [...views].reverse();
}
