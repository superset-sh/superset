import { TEARDOWN_TIMEOUT_MS } from "@superset/host-service";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import {
	type DestroyWorkspaceError,
	useDestroyWorkspace,
} from "renderer/hooks/host-service/useDestroyWorkspace";
import stripAnsi from "strip-ansi";

interface DashboardSidebarDeleteDialogProps {
	workspaceId: string;
	workspaceName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Fires after a successful destroy (any warnings reported via toast). */
	onDeleted?: () => void;
}

export function DashboardSidebarDeleteDialog({
	workspaceId,
	workspaceName,
	open,
	onOpenChange,
	onDeleted,
}: DashboardSidebarDeleteDialogProps) {
	const { destroy } = useDestroyWorkspace(workspaceId);

	const [deleteBranch, setDeleteBranch] = useState(false);
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<DestroyWorkspaceError | null>(null);

	const reset = () => {
		setDeleteBranch(false);
		setIsPending(false);
		setError(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (isPending) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const run = async (force: boolean) => {
		setIsPending(true);
		try {
			const result = await destroy({ deleteBranch, force });
			for (const warning of result.warnings) toast.warning(warning);
			toast.success(`Deleted ${workspaceName}`);
			reset();
			onOpenChange(false);
			onDeleted?.();
		} catch (err) {
			setIsPending(false);
			setError(err as DestroyWorkspaceError);
		}
	};

	if (error?.kind === "conflict") {
		return (
			<AlertDialog open={open} onOpenChange={handleOpenChange}>
				<AlertDialogContent className="max-w-[380px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Uncommitted changes in worktree
						</AlertDialogTitle>
						<AlertDialogDescription>
							The worktree has uncommitted or unlocked work. Force delete will
							discard it.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => handleOpenChange(false)}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => run(true)}
							disabled={isPending}
						>
							{isPending ? "Deleting..." : "Delete anyway"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	if (error?.kind === "teardown-failed") {
		const cause = error.cause;
		const reason = cause.timedOut
			? `Teardown timed out after ${Math.round(TEARDOWN_TIMEOUT_MS / 1000)}s`
			: cause.exitCode != null
				? `Teardown exited with code ${cause.exitCode}`
				: "Teardown failed to start";
		const cleanTail = stripAnsi(cause.outputTail);
		return (
			<AlertDialog open={open} onOpenChange={handleOpenChange}>
				<AlertDialogContent className="max-w-[500px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{reason}
						</AlertDialogTitle>
						<AlertDialogDescription>
							Delete anyway will skip the teardown script entirely.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{cleanTail && (
						<pre className="mx-4 mb-2 max-h-48 overflow-auto rounded border bg-muted px-2 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
							{cleanTail}
						</pre>
					)}
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => handleOpenChange(false)}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => run(true)}
							disabled={isPending}
						>
							{isPending ? "Deleting..." : "Delete anyway"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	if (error?.kind === "unknown") {
		return (
			<AlertDialog open={open} onOpenChange={handleOpenChange}>
				<AlertDialogContent className="max-w-[380px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Delete failed
						</AlertDialogTitle>
						<AlertDialogDescription>{error.message}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => handleOpenChange(false)}
						>
							Close
						</Button>
						<Button
							variant="secondary"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setError(null)}
						>
							Try again
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Delete workspace "{workspaceName}"?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This removes the worktree from disk. The cloud workspace record will
						also be removed.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="px-4 pb-2">
					<div className="flex items-center gap-2">
						<Checkbox
							id="delete-local-branch"
							checked={deleteBranch}
							onCheckedChange={(checked) => setDeleteBranch(checked === true)}
							disabled={isPending}
						/>
						<Label
							htmlFor="delete-local-branch"
							className="text-xs text-muted-foreground cursor-pointer select-none"
						>
							Also delete local branch
						</Label>
					</div>
				</div>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => handleOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => run(false)}
						disabled={isPending}
					>
						{isPending ? "Deleting..." : "Delete"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
