import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { LuLaptop } from "react-icons/lu";
import { useOpenPinAndSetupModal } from "renderer/stores/add-repository-modal";

interface WorkspaceNotOnThisHostStateProps {
	hostName: string | null;
	projectId: string;
	projectName: string;
	projectGithubOwner: string | null;
	projectGithubRepoName: string | null;
}

/**
 * Phase 3 stub shown when the user clicks a workspace whose host is a
 * different device. Explains the situation and offers the two paths out
 * (switch to the owning host, or set this project up locally so a new
 * workspace can be created here). A richer design — including a
 * remote-terminal fallback — lives outside this plan.
 */
export function WorkspaceNotOnThisHostState({
	hostName,
	projectId,
	projectName,
	projectGithubOwner,
	projectGithubRepoName,
}: WorkspaceNotOnThisHostStateProps) {
	const openPinAndSetup = useOpenPinAndSetupModal();
	const hostLabel = hostName ?? "another device";

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-card px-6 py-8 text-center">
				<div className="mb-4 rounded-full border border-border bg-muted/40 p-3 text-muted-foreground">
					<LuLaptop className="size-5" />
				</div>
				<h1 className="text-lg font-semibold tracking-tight">
					Workspace lives on {hostLabel}
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Workspaces are bound to the host that created them. To open this one,
					switch to {hostLabel}, or set {projectName} up on this device and
					create a new workspace here.
				</p>
				<div className="mt-6 flex items-center gap-2">
					<Button
						size="sm"
						onClick={() =>
							openPinAndSetup({
								id: projectId,
								name: projectName,
								githubOwner: projectGithubOwner,
								githubRepoName: projectGithubRepoName,
							})
						}
					>
						Set up here
					</Button>
					<Button asChild size="sm" variant="outline">
						<Link to="/v2-workspaces">Browse workspaces</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
