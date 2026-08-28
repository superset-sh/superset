import { i18n } from "@superset/i18n";
import type { PagePaneData } from "../../../../types";

export function pagePaneLabel(data: PagePaneData): string {
	return (
		data.title?.trim() ||
		data.slug.trim() ||
		i18n._({ id: "workspace.pagePane.untitledPage", message: "Untitled Page" })
	);
}
