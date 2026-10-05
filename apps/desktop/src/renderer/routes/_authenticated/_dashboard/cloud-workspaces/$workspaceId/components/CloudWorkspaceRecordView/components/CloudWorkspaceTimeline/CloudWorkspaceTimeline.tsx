import type { CloudWorkspaceTimelineEntry as Entry } from "../../../../types";
import { CloudWorkspaceTimelineEntry } from "./components/CloudWorkspaceTimelineEntry";

interface CloudWorkspaceTimelineProps {
	entries: Entry[];
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

export function CloudWorkspaceTimeline({
	entries,
	...entryProps
}: CloudWorkspaceTimelineProps) {
	return (
		<div>
			{entries.map((entry, index) => (
				<CloudWorkspaceTimelineEntry
					key={entry.id}
					entry={entry}
					isLast={index === entries.length - 1}
					{...entryProps}
				/>
			))}
		</div>
	);
}
