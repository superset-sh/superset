import { MultiFileDiff } from "@pierre/diffs/react";
import { workspaceTrpc } from "@superset/workspace-client";

interface ThreadAnnotation {
	side: "deletions" | "additions";
	lineNumber: number;
	metadata: {
		threadId: string;
		isResolved: boolean;
		comments: Array<{
			id: string;
			authorLogin: string;
			avatarUrl?: string;
			body: string;
			createdAt?: number;
		}>;
	};
}

interface WorkspaceDiffProps {
	workspaceId: string;
	path: string;
	category: "against-base" | "staged" | "unstaged";
	annotations?: ThreadAnnotation[];
	diffStyle: "split" | "unified";
	expandUnchanged: boolean;
	collapsed: boolean;
	onToggleCollapsed: () => void;
}

export function WorkspaceDiff({
	workspaceId,
	path,
	category,
	diffStyle,
	expandUnchanged,
	collapsed,
	onToggleCollapsed,
}: WorkspaceDiffProps) {
	const diffQuery = workspaceTrpc.git.getDiff.useQuery(
		{ workspaceId, path, category },
		{ staleTime: 0 },
	);

	if (!diffQuery.data) return null;

	return (
		<MultiFileDiff
			oldFile={diffQuery.data.oldFile}
			newFile={diffQuery.data.newFile}
			options={{
				diffStyle,
				expandUnchanged,
				overflow: "wrap",
				collapsed,
			}}
			renderHeaderPrefix={() => (
				<button
					type="button"
					onClick={onToggleCollapsed}
					className="mr-1 text-muted-foreground hover:text-foreground"
				>
					{collapsed ? "▶" : "▼"}
				</button>
			)}
		/>
	);
}
