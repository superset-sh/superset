import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface RenameBranchDialogProps {
	workspaceId: string;
	currentBranchName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAfterRename?: (newName: string) => void;
}

export function RenameBranchDialog({
	workspaceId,
	currentBranchName,
	open,
	onOpenChange,
	onAfterRename,
}: RenameBranchDialogProps) {
	const [value, setValue] = useState(currentBranchName);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const electronUtils = electronTrpc.useUtils();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	// Workspace records are host-owned: a v2 workspace resolves to its owning
	// host (which may be remote, via relay). v1 workspaces aren't in the host
	// collection and fall back to the local host-service.
	const hostTarget = useWorkspaceHostTarget(workspaceId);
	const workspaceHostUrl =
		hostTarget.status === "ready" ? hostTarget.url : activeHostUrl;

	useEffect(() => {
		if (open) setValue(currentBranchName);
	}, [open, currentBranchName]);

	const trimmed = value.trim();
	const isUnchanged = trimmed === currentBranchName;
	const isInvalid = trimmed.length === 0 || isUnchanged;

	const handleSubmit = async () => {
		if (isInvalid || isSubmitting) return;
		if (!workspaceHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "renameBranch",
			});
			return;
		}

		const client = getHostServiceClientByUrl(workspaceHostUrl);
		const renamePromise = client.git.renameBranch.mutate({
			workspaceId,
			oldName: currentBranchName,
			newName: trimmed,
		});

		toast.promise(renamePromise, {
			loading: `Renaming branch to ${trimmed}...`,
			success: `Branch renamed to ${trimmed}`,
			error: (err) => errorMessage(err, "Failed to rename branch"),
		});

		setIsSubmitting(true);
		try {
			await renamePromise;
			onAfterRename?.(trimmed);
			void electronUtils.workspaces.getWorktreeInfo.invalidate({
				workspaceId,
			});
			void electronUtils.workspaces.get.invalidate({ id: workspaceId });
			void electronUtils.workspaces.getAllGrouped.invalidate();
			onOpenChange(false);
		} catch {
			// toast.promise surfaced the error to the user
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="max-w-[420px]">
				<DialogHeader>
					<DialogTitle>Rename branch</DialogTitle>
					<DialogDescription>
						Rename the local branch. Branches that have been pushed to remote
						cannot be renamed.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void handleSubmit();
					}}
					className="space-y-4"
				>
					<div className="space-y-1.5">
						<Label htmlFor="rename-branch-input" className="text-xs">
							Branch name
						</Label>
						<Input
							id="rename-branch-input"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									e.stopPropagation();
									void handleSubmit();
								}
							}}
							autoFocus
							disabled={isSubmitting}
							spellCheck={false}
							autoComplete="off"
							className="font-mono"
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isInvalid || isSubmitting}>
							Rename
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
