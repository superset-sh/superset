import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { formatWorktreePath } from "shared/utils";

interface DeleteWorktreeModalProps {
	isOpen: boolean;
	onClose: () => void;
	worktreeName: string;
	worktreePath?: string;
	repoPath?: string;
	hasUncommittedChanges?: boolean;
	onConfirm: () => Promise<void>;
}

export const DeleteWorktreeModal: React.FC<DeleteWorktreeModalProps> = ({
	isOpen,
	onClose,
	worktreeName,
	worktreePath,
	repoPath,
	hasUncommittedChanges = false,
	onConfirm,
}) => {
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConfirm = async () => {
		setIsDeleting(true);
		setError(null);

		try {
			await onConfirm();
			// Close modal on success (parent will handle this)
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete worktree");
		} finally {
			setIsDeleting(false);
		}
	};

	const handleClose = () => {
		if (!isDeleting) {
			onClose();
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Delete Worktree?</DialogTitle>
					<DialogDescription>
						This will permanently delete your local worktree for{" "}
						<span className="font-semibold text-white">{worktreeName}</span>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* Uncommitted changes warning */}
					{hasUncommittedChanges && (
						<div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
							<AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
							<div className="flex-1">
								<p className="text-sm font-medium text-red-300">
									You have uncommitted changes
								</p>
								<p className="text-xs text-red-400/80 mt-1">
									All uncommitted changes will be permanently lost.
								</p>
							</div>
						</div>
					)}

					{/* Worktree path */}
					{worktreePath && (
						<div className="space-y-1">
							<p className="text-xs text-neutral-500">Path</p>
							<p className="text-xs font-mono text-neutral-300 bg-neutral-900 p-2 rounded border border-neutral-800">
								{repoPath ? formatWorktreePath(worktreePath, repoPath) : worktreePath}
							</p>
						</div>
					)}

					{/* Error message */}
					{error && (
						<div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
							<p className="text-sm text-red-400">{error}</p>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={handleClose}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={handleConfirm}
						disabled={isDeleting}
						className="gap-2"
					>
						{isDeleting ? (
							<>
								<Loader2 size={16} className="animate-spin" />
								Deleting...
							</>
						) : (
							"Delete Worktree"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
