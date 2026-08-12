import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { useState } from "react";
import { LuGitBranch } from "react-icons/lu";

export interface ImportableWorktree {
	branch: string;
	path: string;
}

interface ImportWorktreesDialogProps {
	open: boolean;
	worktrees: ImportableWorktree[];
	isImporting: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (options: { runSetup: boolean }) => void;
}

export function ImportWorktreesDialog({
	open,
	worktrees,
	isImporting,
	onOpenChange,
	onConfirm,
}: ImportWorktreesDialogProps) {
	const [runSetup, setRunSetup] = useState(false);
	const count = worktrees.length;

	return (
		<Dialog
			open={open}
			onOpenChange={isImporting ? undefined : onOpenChange}
			modal
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Import untracked worktrees</DialogTitle>
					<DialogDescription>
						{count === 1
							? "1 worktree in this repository has no workspace. It will be imported as a workspace."
							: `${count} worktrees in this repository have no workspace. They will be imported as workspaces.`}
					</DialogDescription>
				</DialogHeader>
				<ul className="-mx-2.5 max-h-64 overflow-x-hidden overflow-y-auto overscroll-contain">
					{worktrees.map((worktree) => (
						<li
							key={worktree.path}
							className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 rounded-md px-2.5 py-2"
						>
							<LuGitBranch
								className="size-4 shrink-0 text-muted-foreground"
								strokeWidth={2}
							/>
							<div className="flex min-w-0 flex-col">
								<span
									className="truncate text-[13px] font-medium leading-4 text-foreground"
									title={worktree.branch}
								>
									{worktree.branch}
								</span>
								<span
									className="mt-0.5 truncate font-mono text-[11px] leading-4 text-muted-foreground"
									title={worktree.path}
								>
									{worktree.path}
								</span>
							</div>
						</li>
					))}
				</ul>
				<div className="flex items-center gap-2">
					<Checkbox
						id="import-worktrees-run-setup"
						checked={runSetup}
						onCheckedChange={(checked) => setRunSetup(checked === true)}
						disabled={isImporting}
					/>
					<Label
						htmlFor="import-worktrees-run-setup"
						className="cursor-pointer text-[13px] font-normal text-muted-foreground"
					>
						Run setup script in each imported workspace
					</Label>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isImporting}
					>
						Cancel
					</Button>
					<Button
						onClick={() => onConfirm({ runSetup })}
						disabled={isImporting}
					>
						{isImporting
							? "Importing…"
							: count === 1
								? "Import 1 worktree"
								: `Import ${count} worktrees`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
