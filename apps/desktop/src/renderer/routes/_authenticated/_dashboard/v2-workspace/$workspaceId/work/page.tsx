import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness } from "lucide-react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/work/",
)({
	component: WorkspaceWorkModePage,
});

function WorkspaceWorkModePage() {
	const { workspace } = useWorkspace();

	return (
		<div
			className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
			data-dashboard-mode="work"
		>
			<div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
				<BriefcaseBusiness className="size-4 text-muted-foreground" />
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-foreground">
						Work
					</div>
					<div className="truncate text-xs text-muted-foreground">
						{workspace.name || workspace.branch}
					</div>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 items-center justify-center p-6">
				<div className="max-w-md text-center">
					<div className="text-sm font-medium text-foreground">
						Work mode is reserved.
					</div>
					<div className="mt-2 text-sm text-muted-foreground">
						Multi-agent collaboration will land here in a later task.
					</div>
				</div>
			</div>
		</div>
	);
}
