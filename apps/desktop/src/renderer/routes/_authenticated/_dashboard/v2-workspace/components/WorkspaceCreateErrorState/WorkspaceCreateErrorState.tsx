import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

interface WorkspaceCreateErrorStateProps {
	workspaceId: string;
	name?: string;
	error: string;
}

export function WorkspaceCreateErrorState({
	workspaceId,
	name,
	error,
}: WorkspaceCreateErrorStateProps) {
	const navigate = useNavigate();
	const { retry, dismiss } = useWorkspaceCreates();

	const handleDismiss = () => {
		dismiss(workspaceId);
		void navigate({ to: "/v2-workspaces" });
	};

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card px-6 py-8 text-center">
				<div className="mb-4 rounded-full border border-destructive/30 bg-destructive/10 p-3 text-destructive">
					<AlertCircle className="size-5" />
				</div>
				<h1 className="text-lg font-semibold tracking-tight">
					Failed to create workspace
				</h1>
				{name && <p className="mt-2 text-sm text-muted-foreground">{name}</p>}
				<p className="mt-3 text-xs text-destructive/90 break-words">{error}</p>
				<div className="mt-6 flex items-center gap-2">
					<Button size="sm" onClick={() => void retry(workspaceId)}>
						Retry
					</Button>
					<Button size="sm" variant="outline" onClick={handleDismiss}>
						Dismiss
					</Button>
				</div>
			</div>
		</div>
	);
}
