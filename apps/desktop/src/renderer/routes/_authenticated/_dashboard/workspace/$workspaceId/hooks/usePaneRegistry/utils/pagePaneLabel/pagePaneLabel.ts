import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { PagePaneData } from "../../../../types";

export function pagePaneLabel(data: PagePaneData): string {
	return (
		data.title?.trim() ||
		data.slug.trim() ||
		i18n._(msg({ message: "Untitled Page" }))
	);
}
