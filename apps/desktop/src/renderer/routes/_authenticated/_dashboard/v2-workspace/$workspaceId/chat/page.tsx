import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback } from "react";
import { ChatPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

interface WorkspaceChatSearch {
	chatSessionId?: string;
}

function parseNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/chat/",
)({
	component: WorkspaceChatModePage,
	validateSearch: (raw: Record<string, unknown>): WorkspaceChatSearch => ({
		chatSessionId: parseNonEmptyString(raw.chatSessionId),
	}),
});

function WorkspaceChatModePage() {
	const { workspace } = useWorkspace();
	const navigate = useNavigate();
	const { chatSessionId } = Route.useSearch();

	const handleSessionIdChange = useCallback(
		(nextSessionId: string | null) => {
			void navigate({
				to: "/v2-workspace/$workspaceId/chat",
				params: { workspaceId: workspace.id },
				search: nextSessionId ? { chatSessionId: nextSessionId } : {},
				replace: true,
			});
		},
		[navigate, workspace.id],
	);

	return (
		<div
			className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
			data-dashboard-mode="chat"
		>
			<div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium text-foreground">
						Chat
					</div>
					<div className="truncate text-xs text-muted-foreground">
						{workspace.name || workspace.branch}
					</div>
				</div>
				<button
					type="button"
					onClick={() => handleSessionIdChange(null)}
					className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					<Plus className="size-3.5" />
					<span>New chat</span>
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				<ChatPane
					sessionId={chatSessionId ?? null}
					onSessionIdChange={handleSessionIdChange}
					workspaceId={workspace.id}
				/>
			</div>
		</div>
	);
}
