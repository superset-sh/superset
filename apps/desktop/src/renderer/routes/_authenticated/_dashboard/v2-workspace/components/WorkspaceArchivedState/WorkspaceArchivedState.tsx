import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveRestoreIcon, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useArchiveWorkspaceFlow } from "renderer/lib/workspaces/useArchiveWorkspaceFlow";

interface WorkspaceArchivedStateProps {
	workspaceId: string;
	workspaceName: string;
	branch: string;
}

/**
 * Deep link to a workspace the user archived (a PR link, a notification,
 * history). The workspace exists and is intact; it is just put away, so
 * this is neither the workspace UI nor "not found". Unarchiving moves the
 * row back into the live list and the route renders the workspace itself.
 */
export function WorkspaceArchivedState({
	workspaceId,
	workspaceName,
	branch,
}: WorkspaceArchivedStateProps) {
	const { unarchiveWorkspace } = useArchiveWorkspaceFlow();
	const [isRestoring, setIsRestoring] = useState(false);
	const displayName = workspaceName || branch;

	const handleUnarchive = async () => {
		setIsRestoring(true);
		const restored = await unarchiveWorkspace({
			workspaceId,
			source: "deep-link",
		});
		// On success this state unmounts; only a failure needs the button back.
		if (!restored) setIsRestoring(false);
	};

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-5">
				<ArchiveIcon
					className="size-5 text-muted-foreground"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						<Trans>This workspace is archived</Trans>
					</h1>
					<p className="text-[13px] leading-relaxed text-muted-foreground">
						<Trans>
							“{displayName}” was put away. Its files, branch, and terminal
							history are kept. Unarchive it to pick up where you left off.
						</Trans>
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						className="h-7 gap-1.5 px-2.5 text-[13px]"
						disabled={isRestoring}
						onClick={() => void handleUnarchive()}
					>
						<ArchiveRestoreIcon
							className="size-3.5"
							strokeWidth={2}
							aria-hidden="true"
						/>
						<Trans>Unarchive</Trans>
					</Button>
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1.5 px-2 text-[13px] font-medium"
					>
						<Link to="/v2-workspaces" search={{ view: "archived" }}>
							<Trans>View archived workspaces</Trans>
							<ArrowRight
								className="size-3.5"
								strokeWidth={2}
								aria-hidden="true"
							/>
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
