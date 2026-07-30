import { Folder } from "lucide-react";
import { useState } from "react";
import type { PaneMruEntry } from "renderer/stores/pane-mru";

/**
 * Leading icon: the project's avatar, matching the dashboard sidebar.
 *
 * The image is the GitHub owner avatar and is fetched remotely, so it is
 * absent for purely local repos and can fail to load offline. Both cases fall
 * back to a folder glyph rather than a broken image.
 */
export function PaneMruProjectIcon({ entry }: { entry: PaneMruEntry }) {
	const [failed, setFailed] = useState(false);
	const iconUrl = entry.projectIconUrl;

	if (!iconUrl || failed) {
		return <Folder className="size-5 shrink-0 text-muted-foreground" />;
	}

	return (
		<img
			src={iconUrl}
			alt={entry.projectName ?? ""}
			className="size-5 shrink-0 rounded-sm"
			draggable={false}
			onError={() => setFailed(true)}
		/>
	);
}
