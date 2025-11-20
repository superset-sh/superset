import { ScrollArea } from "@superset/ui/scroll-area";

import { RecentProjectItem } from "./RecentProjectItem";
import type { RecentProject } from "shared/types";

interface RecentSectionProps {
	recents: RecentProject[];
	onOpenRecent: (path: string) => void;
	onRemoveRecent: (path: string) => void;
}

export function RecentSection({
	recents,
	onOpenRecent,
	onRemoveRecent,
}: RecentSectionProps) {
	if (recents.length === 0) {
		return null;
	}

	return (
		<div>
			<h2 className="text-sm font-semibold text-foreground mb-3">Recent</h2>
			<ScrollArea className="h-[400px]">
				<div className="space-y-1 pr-4">
					{recents.map((project) => (
						<RecentProjectItem
							key={project.path}
							project={project}
							onOpen={onOpenRecent}
							onRemove={onRemoveRecent}
						/>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}
