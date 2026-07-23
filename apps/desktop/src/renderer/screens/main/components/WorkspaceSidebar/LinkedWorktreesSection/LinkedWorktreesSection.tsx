import type { LinkedTarget } from "shared/linked-worktrees-types";
import { SourceGroup } from "./SourceGroup";

export function LinkedWorktreesSection({
	workspaceId,
	links,
}: {
	workspaceId: string;
	links: LinkedTarget[];
}) {
	if (links.length === 0) return null;

	const groups = new Map<string, LinkedTarget[]>();
	for (const link of links) {
		const arr = groups.get(link.sourceDir) ?? [];
		arr.push(link);
		groups.set(link.sourceDir, arr);
	}

	return (
		<div className="flex flex-col">
			{[...groups.entries()].map(([sourceDir, items]) => (
				<SourceGroup
					key={sourceDir}
					workspaceId={workspaceId}
					sourceDir={sourceDir}
					items={items}
				/>
			))}
		</div>
	);
}
