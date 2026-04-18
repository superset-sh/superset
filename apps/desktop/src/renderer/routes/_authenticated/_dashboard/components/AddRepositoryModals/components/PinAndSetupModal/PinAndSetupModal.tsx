import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { type FormEvent, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { PinAndSetupTarget } from "renderer/stores/add-repository-modal";
import { ParentDirectoryPicker } from "../ParentDirectoryPicker";

interface PinAndSetupModalProps {
	project: PinAndSetupTarget | null;
	/** When true the modal opens in re-point mode. Used for stale-path repair. */
	forceRepoint?: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (result: { projectId: string; repoPath: string }) => void;
	onError?: (message: string) => void;
}

function isConflictError(err: unknown): boolean {
	return (
		err instanceof TRPCClientError &&
		(err.data as { code?: string } | undefined)?.code === "CONFLICT"
	);
}

export function PinAndSetupModal({
	project,
	forceRepoint = false,
	onOpenChange,
	onSuccess,
	onError,
}: PinAndSetupModalProps) {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	const [parentDir, setParentDir] = useState<string | null>(null);
	const [working, setWorking] = useState(false);
	// When setup returns CONFLICT (project already set up at a different path),
	// flip into re-point confirmation mode: same form, different copy + a
	// destructive submit button that retries with the ack flag set.
	// `forceRepoint` pre-sets this for the stale-path repair flow so the user
	// doesn't have to submit once just to see the CONFLICT and re-submit.
	const [conflict, setConflict] = useState(forceRepoint);

	const canSubmit = project !== null && parentDir !== null && !working;

	const reset = () => {
		setParentDir(null);
		setWorking(false);
		setConflict(forceRepoint);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const runSetup = async (acknowledgeWorkspaceInvalidation: boolean) => {
		if (!activeHostUrl || !project || !parentDir) return;
		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.setup.mutate({
				projectId: project.id,
				acknowledgeWorkspaceInvalidation: acknowledgeWorkspaceInvalidation
					? true
					: undefined,
				mode: { kind: "clone", parentDir },
			});
			ensureProjectInSidebar(project.id);
			queryClient.invalidateQueries({
				queryKey: ["project", "list", activeHostUrl],
			});
			onSuccess?.({ projectId: project.id, repoPath: result.repoPath });
			reset();
			onOpenChange(false);
		} catch (err) {
			if (!acknowledgeWorkspaceInvalidation && isConflictError(err)) {
				setConflict(true);
				setWorking(false);
				return;
			}
			onError?.(err instanceof Error ? err.message : String(err));
			setWorking(false);
		}
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit) return;
		void runSetup(conflict);
	};

	return (
		<Dialog open={project !== null} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{conflict ? "Re-point project?" : "Pin & set up"}
						</DialogTitle>
						<DialogDescription>
							{conflict
								? `${project?.name ?? "This project"} is already set up on this device at a different path. Re-pointing it here will invalidate existing workspaces — their worktrees won't open until each is re-created.`
								: `Clone ${project?.name ?? "the project"} onto this device and pin it to the sidebar.`}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 py-4">
						{project && (
							<div className="space-y-1">
								<Label className="text-xs text-muted-foreground">Project</Label>
								<div className="rounded bg-muted px-2 py-1.5 text-sm">
									{project.name}
									{project.githubOwner && project.githubRepoName && (
										<span className="ml-2 text-xs text-muted-foreground">
											{project.githubOwner}/{project.githubRepoName}
										</span>
									)}
								</div>
							</div>
						)}
						<div className="space-y-1">
							<Label>Parent directory</Label>
							<ParentDirectoryPicker
								value={parentDir}
								onChange={setParentDir}
								disabled={working}
								dialogTitle="Select where to clone the project"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={working}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={conflict ? "destructive" : "default"}
							disabled={!canSubmit}
						>
							{working
								? conflict
									? "Re-pointing…"
									: "Setting up…"
								: conflict
									? "Re-point anyway"
									: "Pin & set up"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
