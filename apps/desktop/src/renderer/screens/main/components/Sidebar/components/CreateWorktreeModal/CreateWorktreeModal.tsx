import { Button } from "@superset/ui/button";
import { Loader2 } from "lucide-react";
import { useId } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "renderer/components/ui/dialog";
import { Input } from "renderer/components/ui/input";
import { Label } from "renderer/components/ui/label";
import type { Worktree } from "shared/types";
import { TerminalOutput } from "./TerminalOutput";

interface CreateWorktreeModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (e: React.FormEvent) => void;
	isCreating: boolean;
	branchName: string;
	onBranchNameChange: (value: string) => void;
	branches: string[];
	sourceBranch: string;
	onSourceBranchChange: (value: string) => void;
	worktrees: Worktree[];
	cloneTabsFromWorktreeId: string;
	onCloneTabsFromWorktreeIdChange: (value: string) => void;
	setupStatus?: string;
	setupOutput?: string;
}

export function CreateWorktreeModal({
	isOpen,
	onClose,
	onSubmit,
	isCreating,
	branchName,
	onBranchNameChange,
	branches,
	sourceBranch,
	onSourceBranchChange,
	worktrees,
	cloneTabsFromWorktreeId,
	onCloneTabsFromWorktreeIdChange,
	setupStatus,
	setupOutput,
}: CreateWorktreeModalProps) {
	const inputId = useId();
	const sourceBranchId = useId();
	const cloneTabsId = useId();

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="max-w-[600px] max-h-[80vh] flex flex-col"
				showCloseButton={!isCreating}
			>
				<DialogHeader>
					<DialogTitle>Create New Worktree</DialogTitle>
					<DialogDescription>
						A new branch will be created from the selected source branch
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={onSubmit}
					className="space-y-4 flex-1 flex flex-col overflow-hidden"
				>
					<div className="space-y-2">
						<Label htmlFor={sourceBranchId}>Create From Branch</Label>
						<select
							id={sourceBranchId}
							value={sourceBranch}
							onChange={(e) => onSourceBranchChange(e.target.value)}
							disabled={isCreating}
							className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						>
							{branches.map((branch) => (
								<option key={branch} value={branch}>
									{branch}
								</option>
							))}
						</select>
					</div>

					<div className="space-y-2">
						<Label htmlFor={cloneTabsId}>Clone Tabs From</Label>
						<select
							id={cloneTabsId}
							value={cloneTabsFromWorktreeId}
							onChange={(e) => onCloneTabsFromWorktreeIdChange(e.target.value)}
							disabled={isCreating}
							className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						>
							<option value="">Don't clone tabs</option>
							{worktrees.map((worktree) => (
								<option key={worktree.id} value={worktree.id}>
									{worktree.branch} ({worktree.tabs.length} tab
									{worktree.tabs.length !== 1 ? "s" : ""})
								</option>
							))}
						</select>
					</div>

					<div className="space-y-2">
						<Label htmlFor={inputId}>New Branch Name</Label>
						<Input
							type="text"
							id={inputId}
							value={branchName}
							onChange={(e) => onBranchNameChange(e.target.value)}
							placeholder="feature/my-branch"
							autoFocus
							required
							disabled={isCreating}
						/>
					</div>

					{/* Setup Progress Section */}
					{isCreating && (
						<div className="flex-1 flex flex-col space-y-3 overflow-hidden min-h-[200px]">
							<div className="flex items-center gap-2 text-sm">
								<Loader2 size={16} className="animate-spin" />
								<span>{setupStatus || "Creating worktree..."}</span>
							</div>

							{setupOutput && (
								<div className="flex-1 bg-neutral-900 rounded border border-neutral-700 overflow-hidden">
									<TerminalOutput
										output={setupOutput}
										className="w-full h-full"
									/>
								</div>
							)}
						</div>
					)}

					{/* Error Display - shown when creation failed */}
					{!isCreating &&
						setupStatus &&
						(setupStatus.toLowerCase().includes("failed") ||
							setupStatus.toLowerCase().includes("error")) && (
							<div className="flex-1 flex flex-col space-y-3 overflow-hidden min-h-[200px]">
								<div className="flex items-center gap-2 text-sm text-red-400 font-medium">
									<span>{setupStatus}</span>
								</div>

								{setupOutput && (
									<div className="flex-1 bg-red-500/10 rounded border border-red-500/30 p-3 overflow-auto">
										<pre className="text-red-200 text-xs font-mono whitespace-pre-wrap">
											{setupOutput}
										</pre>
									</div>
								)}
							</div>
						)}

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							disabled={isCreating}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isCreating || !branchName.trim()}>
							{isCreating ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
