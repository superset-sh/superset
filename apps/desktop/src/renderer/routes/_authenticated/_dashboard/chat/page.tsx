import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageSquare, Plus } from "lucide-react";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useAccessibleV2Workspaces } from "../v2-workspaces/hooks/useAccessibleV2Workspaces";

export const Route = createFileRoute("/_authenticated/_dashboard/chat/")({
	component: ChatHomePage,
});

function ChatHomePage() {
	const navigate = useNavigate();
	const openNewWorkspace = useOpenNewWorkspaceModal();
	const { all: workspaces } = useAccessibleV2Workspaces();

	return (
		<div
			className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
			data-dashboard-mode="chat"
		>
			<div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
				<MessageSquare className="size-4 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium text-foreground">
						Chat
					</div>
					<div className="truncate text-xs text-muted-foreground">
						Choose a workspace
					</div>
				</div>
				<button
					type="button"
					onClick={() => openNewWorkspace()}
					className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					<Plus className="size-3.5" />
					<span>New workspace</span>
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex max-w-3xl flex-col gap-2">
					{workspaces.length === 0 ? (
						<div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center">
							<div className="text-sm font-medium text-foreground">
								No workspaces yet.
							</div>
							<button
								type="button"
								onClick={() => openNewWorkspace()}
								className="mt-3 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/80"
							>
								New workspace
							</button>
						</div>
					) : (
						workspaces.map((workspace) => (
							<button
								key={workspace.id}
								type="button"
								onClick={() =>
									navigate({
										to: "/v2-workspace/$workspaceId/chat",
										params: { workspaceId: workspace.id },
										search: {},
									})
								}
								className="flex min-w-0 items-center gap-3 rounded-md border border-border/70 px-3 py-2 text-left transition-colors hover:bg-accent/40"
							>
								<MessageSquare className="size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium text-foreground">
										{workspace.name || workspace.branch}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{workspace.projectName}
									</div>
								</div>
							</button>
						))
					)}
				</div>
			</div>
		</div>
	);
}
