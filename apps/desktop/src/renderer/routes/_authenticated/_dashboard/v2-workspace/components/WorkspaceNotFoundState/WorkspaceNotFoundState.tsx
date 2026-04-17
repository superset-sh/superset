import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { FolderX } from "lucide-react";

interface WorkspaceNotFoundStateProps {
	workspaceId: string;
}

export function WorkspaceNotFoundState({
	workspaceId,
}: WorkspaceNotFoundStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card px-6 py-8 text-center">
				<div className="mb-4 rounded-full border border-border bg-muted/40 p-3 text-muted-foreground">
					<FolderX className="size-5" />
				</div>
				<h1 className="text-lg font-semibold tracking-tight">
					Workspace not found
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					This workspace may have been removed or you may no longer have access
					to it.
				</p>
				<p className="mt-1 text-xs text-muted-foreground/80">
					ID: {workspaceId}
				</p>
				<div className="mt-6 flex items-center gap-2">
					<Button asChild size="sm">
						<Link to="/v2-workspaces">Browse workspaces</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
