import type { PagePaneData } from "../../../../types";

export function pagePaneLabel(data: PagePaneData): string {
	return data.title?.trim() || data.slug.trim() || "Untitled Page";
}
